import { useEffect, useRef, useState } from 'react';

/**
 * Split-panel auth dialog. All presentation lives in learnspace.css rather
 * than inline styles, so the two modes share one layout and stay consistent.
 */
export default function AuthModal({
  onClose,
  onLogin,
  onRegister,
  authError,
  isAuthLoading,
  initialMode = 'login',
}) {
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isLogin = mode === 'login';
  const firstFieldRef = useRef(null);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(event) {
    event.preventDefault();
    if (isLogin) onLogin?.({ email, password });
    else onRegister?.({ name, email, password });
  }

  return (
    <div className="ls-modal-overlay" onClick={onClose}>
      <div
        className="ls-auth-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ls-auth-title"
      >
        {/* Left rail: brand and value props. Hidden on small screens. */}
        <aside className="ls-auth-aside">
          <div className="ls-brand ls-auth-brand">
            <span aria-hidden="true">L</span> LearnSpace
          </div>

          <h3>Practical courses, no filler.</h3>

          <ul className="ls-auth-points">
            <li>
              <strong>Learn by doing</strong>
              Every lesson ends with a clear next step.
            </li>
            <li>
              <strong>Track your progress</strong>
              Pick up exactly where you left off.
            </li>
            <li>
              <strong>Lifetime access</strong>
              Buy once, revisit whenever you want.
            </li>
          </ul>

          <p className="ls-auth-aside-foot">Free courses need no card.</p>
        </aside>

        {/* Right rail: the form */}
        <div className="ls-auth-main">
          <button className="ls-modal-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>

          <div className="ls-auth-switch" role="tablist" aria-label="Authentication mode">
            <button
              role="tab"
              aria-selected={isLogin}
              className={isLogin ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={!isLogin}
              className={!isLogin ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Create account
            </button>
          </div>

          <h2 id="ls-auth-title" className="ls-auth-title">
            {isLogin ? 'Welcome back' : 'Start learning'}
          </h2>
          <p className="ls-auth-sub">
            {isLogin
              ? 'Sign in to continue where you left off.'
              : 'Takes a minute. No card needed for free courses.'}
          </p>

          {authError && <div className="ls-alert">{authError}</div>}

          <form className="ls-form" onSubmit={submit}>
            {!isLogin && (
              <label className="ls-field">
                <span>Full name</span>
                <input
                  ref={firstFieldRef}
                  className="ls-input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Priya Raman"
                  required
                  minLength={2}
                />
              </label>
            )}

            <label className="ls-field">
              <span>Email address</span>
              <input
                ref={isLogin ? firstFieldRef : undefined}
                className="ls-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="ls-field">
              <span>Password</span>
              <div className="ls-input-group">
                <input
                  className="ls-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={isLogin ? 'Your password' : 'At least 8 characters'}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  className="ls-input-action"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {!isLogin && <small className="ls-field-hint">Use 8 characters or more.</small>}
            </label>

            <button
              className="ls-button ls-button-blue ls-wide ls-auth-submit"
              type="submit"
              disabled={isAuthLoading}
            >
              {isAuthLoading
                ? 'Please wait…'
                : isLogin
                  ? 'Sign in'
                  : 'Create account'}
            </button>
          </form>

          <p className="ls-auth-alt">
            {isLogin ? 'New to LearnSpace?' : 'Already have an account?'}
            <button type="button" onClick={() => setMode(isLogin ? 'register' : 'login')}>
              {isLogin ? 'Create one' : 'Sign in'}
            </button>
          </p>

          {!isLogin && (
            <p className="ls-auth-legal">
              By creating an account you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
