import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LearnSpace from './LearnSpace';
import CheckoutModal from './CheckoutModal';
import { api, setToken, getToken, ApiError } from './lib/api';

function App() {
  const [user, setUser] = useState(null);
  const [enrollments, setEnrollments] = useState(new Set());
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [restoring, setRestoring] = useState(Boolean(getToken()));

  const [checkoutCourse, setCheckoutCourse] = useState(null);
  const [notice, setNotice] = useState(null);

  const userWithEnrollments = useMemo(
    () => (user ? { ...user, enrollments: [...enrollments] } : null),
    [user, enrollments],
  );

  // Restore the session on load so a refresh does not sign the user out.
  useEffect(() => {
    if (!getToken()) return;

    let active = true;
    api
      .me()
      .then((data) => {
        if (!active) return;
        setUser(data.user);
        setEnrollments(new Set(data.enrollments));
      })
      .catch(() => {
        if (active) setToken(null);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshEnrollments = useCallback(async () => {
    try {
      const data = await api.enrollments();
      setEnrollments(new Set(data.activeCourseIds));
    } catch {
      // Non-fatal: the user keeps whatever access state they already had.
    }
  }, []);

  async function handleAuth(kind, credentials) {
    setIsAuthLoading(true);
    setAuthError('');
    try {
      const data = kind === 'login' ? await api.login(credentials) : await api.register(credentials);
      setToken(data.token);
      setUser(data.user);
      const enrolled = kind === 'login' ? await api.enrollments().catch(() => null) : null;
      setEnrollments(new Set(enrolled?.activeCourseIds ?? []));
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setIsAuthLoading(false);
    }
  }

  function handleLogout() {
    setUser(null);
    setEnrollments(new Set());
    setToken(null);
    setNotice({ kind: 'success', text: 'You are signed out.' });
  }

  async function handleEnroll(course) {
    if (!course) return;

    if (course.price > 0) {
      setCheckoutCourse(course);
      return;
    }

    try {
      await api.enrollFree(course.id);
      setEnrollments((prev) => new Set([...prev, course.id]));
      setNotice({ kind: 'success', text: `You are enrolled in ${course.title}.` });
    } catch (err) {
      if (err instanceof ApiError && err.status === 402) {
        setCheckoutCourse(course);
        return;
      }
      setNotice({ kind: 'error', text: err.message });
    }
  }

  function handlePaymentSuccess(courseId) {
    setEnrollments((prev) => new Set([...prev, courseId]));
    setCheckoutCourse(null);
    setNotice({ kind: 'success', text: 'Payment confirmed. Your course is unlocked.' });
    refreshEnrollments();
  }

  async function handlePlayLesson(lesson) {
    const data = await api.playback(lesson.id);
    return data.embedUrl;
  }

  return (
    <>
      <LearnSpace
        user={userWithEnrollments}
        authError={authError}
        isAuthLoading={isAuthLoading}
        restoring={restoring}
        notice={notice}
        onDismissNotice={() => setNotice(null)}
        onLogin={(c) => handleAuth('login', c)}
        onRegister={(c) => handleAuth('register', c)}
        onLogout={handleLogout}
        onEnroll={handleEnroll}
        onPlayLesson={handlePlayLesson}
        onUserUpdate={(next) => setUser(next)}
        onNotice={setNotice}
      />

      {checkoutCourse && (
        <CheckoutModal
          course={checkoutCourse}
          onClose={() => setCheckoutCourse(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
