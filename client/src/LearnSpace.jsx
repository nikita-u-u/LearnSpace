import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./learnspace.css";
import { api, formatMoney, formatPrice } from "./lib/api";
import Avatar from "./Avatar";
import AuthModal from "./AuthModal";
import AccountPage from "./AccountPage";

const CATEGORIES = ["All", "Development", "Data", "Design", "Business", "Marketing", "Cloud", "Security", "Language", "Creative", "Growth"];

export const SITE_URL = "https://learn-space-coral.vercel.app/";
export const CONTACT_EMAIL = "nikitakashyap013@gmail.com";

const FOOTER_PAGES = [
  { id: "about", label: "About Us" },
  { id: "privacy", label: "Privacy Policy" },
  { id: "terms", label: "Terms of Service" },
  { id: "contact", label: "Contact" },
];

/** Views that are not part of the course catalogue browsing flow. */
const STATIC_PAGES = new Set(["about", "privacy", "terms", "contact", "account"]);

export default function LearnSpace({
  user = null,
  authError = "",
  isAuthLoading = false,
  restoring = false,
  notice = null,
  onDismissNotice,
  onLogin,
  onRegister,
  onLogout,
  onEnroll,
  onPlayLesson,
  onUserUpdate,
  onNotice,
  checkoutSlot = null,
}) {
  const [view, setView] = useState("catalog");
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [price, setPrice] = useState("all");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState("recommended");
  
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(0);
  const [playback, setPlayback] = useState({ status: "idle", url: "" });
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Server-side Pagination & Data State
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [stats, setStats] = useState(null);

  // Debounce only the search text. Filters apply immediately.
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Reset to the first page whenever the result set changes.
  // Note: results are intentionally NOT cleared here, so the grid keeps
  // showing the previous page instead of flashing an empty state.
  useEffect(() => {
    setPage(1);
  }, [category, level, price, sort, debouncedQuery]);

  // Real catalogue figures from the API.
  useEffect(() => {
    let active = true;
    fetch("/api/stats")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data) setStats(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Fetch courses
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadCourses() {
      setLoading(true);
      setLoadError("");
      try {
        const params = new URLSearchParams({ page: String(page), limit: "24" });
        if (category !== "All") params.set("category", category);
        if (level !== "all") params.set("level", level);
        if (price !== "all") params.set("price", price);
        if (sort) params.set("sort", sort);
        if (debouncedQuery) params.set("search", debouncedQuery);

        const res = await fetch(`/api/courses?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Failed to load courses");
        const data = await res.json();

        if (!active) return;

        setCourses(data.courses ?? []);
        setTotalCount(data.totalCount ?? 0);
      } catch (err) {
        if (err.name === "AbortError" || !active) return;
        console.error(err);
        // Surface the real reason: "check your connection" sent me chasing a
        // network problem when the actual cause was a 404 from a misrouted API.
        setLoadError(`We could not load courses. ${err.message}`);
        setCourses([]);
        setTotalCount(0);
      } finally {
        if (active) {
          setLoading(false);
          setHasLoadedOnce(true);
        }
      }
    }

    loadCourses();
    return () => {
      active = false;
      controller.abort();
    };
  }, [page, category, level, price, sort, debouncedQuery]);

  useEffect(() => {
    if (user) setIsAuthModalOpen(false);
  }, [user]);

  const enrolledIds = useMemo(
    () => new Set(user?.enrollments ?? []),
    [user?.enrollments],
  );

  // "My courses" comes from its own endpoint, because an enrolled course can
  // live on any page of the paginated catalogue. It also carries progress.
  const [myCourses, setMyCourses] = useState([]);
  const [mySummary, setMySummary] = useState(null);
  const [myCoursesLoading, setMyCoursesLoading] = useState(false);

  const loadMyCourses = useCallback(async () => {
    if (!user) {
      setMyCourses([]);
      setMySummary(null);
      return;
    }
    setMyCoursesLoading(true);
    try {
      const data = await api.myCourses();
      setMyCourses(data.courses ?? []);
      setMySummary(data.summary ?? null);
    } catch {
      setMyCourses([]);
    } finally {
      setMyCoursesLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (view === "learning" || view === "account") loadMyCourses();
  }, [view, loadMyCourses, enrolledIds.size]);

  /** Marks a lesson done/undone and refreshes the derived progress numbers. */
  const toggleLessonComplete = useCallback(
    async (lesson, completed) => {
      try {
        await api.setLessonProgress(lesson.id, { completed });
        setMyCourses((prev) =>
          prev.map((course) => {
            if (!course.lessons.some((l) => l.id === lesson.id)) return course;
            const lessons = course.lessons.map((l) =>
              l.id === lesson.id ? { ...l, completed } : l,
            );
            const done = lessons.filter((l) => l.completed).length;
            return {
              ...course,
              lessons,
              completedLessons: done,
              percentComplete: lessons.length
                ? Math.round((done / lessons.length) * 100)
                : 0,
            };
          }),
        );
        // Summary counts live server-side; refetch rather than recompute.
        loadMyCourses();
      } catch (err) {
        onNotice?.({ kind: "error", text: err.message });
      }
    },
    [loadMyCourses, onNotice],
  );

  // Close the account dropdown on outside click.
  useEffect(() => {
    if (!isAccountMenuOpen) return;
    function onPointerDown(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    }
    function onKey(event) {
      if (event.key === "Escape") setIsAccountMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [isAccountMenuOpen]);

  // A course can be opened from either the catalogue or My learning.
  const currentCourse = selectedCourse
    ? courses.find((course) => course.id === selectedCourse) ??
      myCourses.find((course) => course.id === selectedCourse)
    : null;

  const currentLesson = currentCourse?.lessons?.[selectedLesson] ?? null;
  const isEnrolled = currentCourse ? enrolledIds.has(currentCourse.id) : false;
  const requiresEnrollment = currentCourse?.price > 0 && !isEnrolled;

  function openCourse(courseId) {
    setSelectedCourse(courseId);
    setSelectedLesson(0);
    setPlayback({ status: "idle", url: "" });
    setView("lesson");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openPage(nextView) {
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Searching from any page should show the results, not silently filter a
  // catalog the user cannot currently see.
  function handleQueryChange(value) {
    setQuery(value);
    if (view !== "catalog") setView("catalog");
  }

  // Close the mobile search overlay on Escape for keyboard users.
  useEffect(() => {
    if (!isMobileSearchOpen) return;
    function onKey(event) {
      if (event.key === "Escape") setIsMobileSearchOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobileSearchOpen]);

  async function requestPlayback() {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!currentCourse || !currentLesson) return;
    if (requiresEnrollment) return;

    setPlayback({ status: "loading", url: "" });
    try {
      const url = await onPlayLesson(currentLesson);
      setPlayback({ status: "ready", url });
    } catch (err) {
      setPlayback({
        status: "error",
        url: "",
        message: err?.message || "Playback could not be verified.",
      });
    }
  }

  async function enroll() {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!currentCourse) return;
    // Pass the whole course so the shell can tell free from paid.
    await onEnroll?.(currentCourse);
  }

  return (
    <div className="ls-app">
      {/* Rendered here, inside .ls-app, so the scoped control styles apply. */}
      {checkoutSlot}

      {isAuthModalOpen && (
        <AuthModal
          onClose={() => setIsAuthModalOpen(false)}
          onLogin={onLogin}
          onRegister={onRegister}
          authError={authError}
          isAuthLoading={isAuthLoading}
        />
      )}

      <a className="ls-skip-link" href="#ls-main">Skip to content</a>

      <header className="ls-topbar">
        <button className="ls-brand ls-brand-button" onClick={() => openPage("catalog")} aria-label="LearnSpace home">
          <img className="ls-brand-mark" src="/favicon-48.png" alt="" width="30" height="30" />
          <span className="ls-brand-name">LearnSpace</span>
        </button>

        <nav className="ls-nav ls-nav-desktop" aria-label="Primary navigation">
          <button className={view === "catalog" ? "active" : ""} onClick={() => openPage("catalog")}>Browse</button>
          {user && (
            <button className={view === "learning" ? "active" : ""} onClick={() => openPage("learning")}>My courses</button>
          )}
        </nav>

        <SearchField
          className="ls-search-desktop"
          query={query}
          onChange={handleQueryChange}
        />

        <button
          className="ls-icon-button ls-search-toggle"
          onClick={() => setIsMobileSearchOpen(true)}
          aria-label="Search courses"
        >
          <span aria-hidden="true">⌕</span>
        </button>

        <div className="ls-account" ref={accountMenuRef}>
          {user ? (
            <>
              <button
                className="ls-account-trigger"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
              >
                <Avatar user={user} size={36} />
                <span className="ls-account-copy">
                  <strong>{user.name}</strong>
                  <small>{user.role}</small>
                </span>
                <span className="ls-caret" aria-hidden="true">▾</span>
              </button>

              {isAccountMenuOpen && (
                <div className="ls-account-menu" role="menu">
                  <div className="ls-account-menu-head">
                    <Avatar user={user} size={42} />
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                  </div>

                  <button
                    role="menuitem"
                    onClick={() => { setIsAccountMenuOpen(false); openPage("learning"); }}
                  >
                    <span aria-hidden="true">◉</span> My courses
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => { setIsAccountMenuOpen(false); openPage("account"); }}
                  >
                    <span aria-hidden="true">⚙</span> Account settings
                  </button>
                  <hr />
                  <button
                    role="menuitem"
                    className="is-danger"
                    onClick={() => { setIsAccountMenuOpen(false); onLogout?.(); }}
                  >
                    <span aria-hidden="true">⏎</span> Sign out
                  </button>
                </div>
              )}
            </>
          ) : restoring ? (
            <span className="ls-inline-spinner" aria-label="Restoring session" />
          ) : (
            <button className="ls-button ls-button-blue ls-signin" onClick={() => setIsAuthModalOpen(true)}>
              <span className="ls-signin-icon" aria-hidden="true">→]</span>
              <span className="ls-signin-label">Sign in</span>
            </button>
          )}
        </div>
      </header>

      {isMobileSearchOpen && (
        <div className="ls-mobile-search">
          <SearchField
            autoFocus
            query={query}
            onChange={handleQueryChange}
          />
          <button
            className="ls-button ls-button-outline ls-button-small"
            onClick={() => setIsMobileSearchOpen(false)}
          >
            Done
          </button>
        </div>
      )}

      {notice && (
        <div className={`ls-toast ${notice.kind === "error" ? "is-error" : "is-success"}`} role="status">
          <span aria-hidden="true">{notice.kind === "error" ? "⚠" : "✓"}</span>
          <p>{notice.text}</p>
          <button onClick={onDismissNotice} aria-label="Dismiss message">✕</button>
        </div>
      )}

      <main className="ls-main" id="ls-main">
        {view === "catalog" && (
          <section className="ls-shell ls-view" aria-labelledby="catalog-heading">
            <div className="ls-hero">
              <div>
                <h1 id="catalog-heading">Learn something <em>useful.</em></h1>
                <p style={{ marginTop: "20px", maxWidth: "48ch" }}>
                  Short, practical courses with a clear next step after every lesson. Master new skills at your own pace.
                </p>
              </div>
            </div>
            
            {stats && <CatalogFacts stats={stats} />}
            
            <div className="ls-filter-row" role="list" aria-label="Course categories" style={{ marginTop: '24px' }}>
              {CATEGORIES.map((item) => (
                <button
                  key={item}
                  className={category === item ? "ls-chip active" : "ls-chip"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="ls-toolbar">
              <label>Price <select value={price} onChange={(e) => setPrice(e.target.value)}><option value="all">All</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
              <label>Level <select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recommended">Recommended order</option><option value="new">Recently added</option><option value="low">Price low</option><option value="high">Price high</option></select></label>
              <span className="ls-count">
                {loading ? "Loading…" : `${courses.length} of ${totalCount} courses`}
              </span>
            </div>

            {loadError && <div className="ls-alert">{loadError}</div>}

            {!hasLoadedOnce ? (
              <CourseSkeleton />
            ) : (
              <>
                <div className="ls-results-head">
                  <div className="ls-section-label">
                    {debouncedQuery
                      ? `Results for “${debouncedQuery}”`
                      : category === "All"
                        ? "All courses"
                        : category}
                  </div>
                  {loading && <span className="ls-inline-spinner" aria-label="Loading results" />}
                </div>

                {courses.length > 0 ? (
                  <div className={`ls-course-grid ${loading ? "is-stale" : ""}`}>
                    {courses.map((course) => (
                      <CourseCard
                        key={course.id}
                        course={course}
                        owned={enrolledIds.has(course.id)}
                        onOpen={() => openCourse(course.id)}
                      />
                    ))}
                  </div>
                ) : (
                  !loading && !loadError && (
                    <EmptyState
                      query={debouncedQuery}
                      onReset={() => { setQuery(""); setCategory("All"); setPrice("all"); setLevel("all"); setSort("recommended"); }}
                    />
                  )
                )}

                <Pagination
                  page={page}
                  totalPages={Math.ceil(totalCount / 24)}
                  onChange={(next) => { setPage(next); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              </>
            )}
          </section>
        )}

        {view === "lesson" && currentCourse && (
          <section className="ls-shell ls-view">
            <button className="ls-back" onClick={() => setView("catalog")}>
              <span aria-hidden="true">←</span> Back to courses
            </button>
            <div className="ls-course-layout">
              <div>
                <LessonPlayer
                  course={currentCourse}
                  lesson={currentLesson}
                  locked={requiresEnrollment}
                  playback={playback}
                  onPlay={requestPlayback}
                  onEnroll={enroll}
                />
                <div className="ls-course-meta">
                  <span>{currentCourse.category}</span>
                  <span>{currentCourse.level}</span>
                  <span>{currentCourse.price > 0 ? "Paid" : "Free"}</span>
                </div>
                <h1 className="ls-course-title">{currentCourse.title}</h1>
                <p className="ls-course-copy">{currentCourse.description}</p>
                <div className="ls-lessons">
                  <h2>{currentCourse.lessons.length} lessons</h2>
                  {currentCourse.lessons.map((lesson, index) => (
                    <button
                      key={lesson.id}
                      className={index === selectedLesson ? "ls-lesson active" : "ls-lesson"}
                      onClick={() => { setSelectedLesson(index); setPlayback({ status: "idle", url: "" }); }}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{lesson.title}</strong>
                      <small>{lesson.duration}</small>
                    </button>
                  ))}
                </div>
              </div>
              <aside className="ls-side">
                <div className="ls-side-price">
                  <strong className="ls-price">
                    {currentCourse.price
                      ? formatPrice(currentCourse.price, currentCourse.currency)
                      : "Free"}
                  </strong>
                  {currentCourse.price > 0 && <small>One-time payment</small>}
                </div>

                {isEnrolled && <div className="ls-owned-badge">✓ You own this course</div>}

                <button
                  className="ls-button ls-button-blue ls-wide"
                  onClick={isEnrolled ? requestPlayback : enroll}
                >
                  {isEnrolled
                    ? "Continue course"
                    : currentCourse.price
                      ? `Buy for ${formatPrice(currentCourse.price, currentCourse.currency)}`
                      : "Enroll free"}
                </button>

                <ul>
                  <li>Lessons <b>{currentCourse.lessons.length}</b></li>
                  <li>Level <b>{currentCourse.level}</b></li>
                  <li>Instructor <b>{currentCourse.teacher}</b></li>
                  <li>Access <b>Lifetime</b></li>
                  <li>Playback <b>{isEnrolled ? "Unlocked" : "After enrollment"}</b></li>
                </ul>
              </aside>
            </div>
          </section>
        )}

        {view === "about" && <AboutPage onBrowse={() => openPage("catalog")} />}
        {view === "privacy" && <PrivacyPage />}
        {view === "terms" && <TermsPage />}
        {view === "contact" && <ContactPage />}

        {view === "learning" && user && (
          <section className="ls-shell ls-view">
            <div className="ls-hero">
              <div>
                <h1>My <em>courses.</em></h1>
                <p style={{ marginTop: "20px" }}>
                  Everything you have unlocked, with your progress on each.
                </p>
              </div>
            </div>

            {mySummary && myCourses.length > 0 && (
              <div className="ls-facts">
                <div className="ls-fact">
                  <strong>{mySummary.courses}</strong>
                  <small>Enrolled</small>
                </div>
                <div className="ls-fact">
                  <strong>{mySummary.inProgress}</strong>
                  <small>In progress</small>
                </div>
                <div className="ls-fact">
                  <strong>{mySummary.completed}</strong>
                  <small>Completed</small>
                </div>
                <div className="ls-fact">
                  <strong>{mySummary.lessonsCompleted}</strong>
                  <small>Lessons done</small>
                </div>
              </div>
            )}

            {myCoursesLoading ? (
              <CourseSkeleton />
            ) : myCourses.length === 0 ? (
              <div className="ls-empty">
                <h2>Nothing here yet</h2>
                <p>Courses you enroll in show up here, with progress tracking.</p>
                <button className="ls-button ls-button-blue" onClick={() => openPage("catalog")}>
                  Browse the catalogue
                </button>
              </div>
            ) : (
              <>
                <div className="ls-section-label">
                  {myCourses.length} {myCourses.length === 1 ? "course" : "courses"}
                </div>
                <div className="ls-progress-list">
                  {myCourses.map((course) => (
                    <MyCourseRow
                      key={course.id}
                      course={course}
                      onOpen={() => openCourse(course.id)}
                      onToggleLesson={toggleLessonComplete}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {view === "account" && user && (
          <AccountPage
            user={user}
            summary={mySummary}
            onUserUpdate={onUserUpdate}
            onLogout={onLogout}
          />
        )}
      </main>

      {/* Sticky purchase bar, mobile only. Keeps the primary action reachable
          without scrolling back to the sidebar. */}
      {view === "lesson" && currentCourse && (
        <div className="ls-mobile-buybar">
          <div>
            <strong>
              {currentCourse.price
                ? formatPrice(currentCourse.price, currentCourse.currency)
                : "Free"}
            </strong>
            <small>{isEnrolled ? "Unlocked" : `${currentCourse.lessons.length} lessons`}</small>
          </div>
          <button
            className="ls-button ls-button-blue"
            onClick={isEnrolled ? requestPlayback : enroll}
          >
            {isEnrolled ? "Continue" : currentCourse.price ? "Buy now" : "Enroll free"}
          </button>
        </div>
      )}

      <nav className="ls-nav ls-nav-mobile" aria-label="Primary navigation">
        <button className={view === "catalog" ? "active" : ""} onClick={() => openPage("catalog")}>
          <span aria-hidden="true">▦</span> Browse
        </button>
        {user ? (
          <>
            <button className={view === "learning" ? "active" : ""} onClick={() => openPage("learning")}>
              <span aria-hidden="true">◉</span> My courses
            </button>
            <button className={view === "account" ? "active" : ""} onClick={() => openPage("account")}>
              <span aria-hidden="true">⚙</span> Account
            </button>
          </>
        ) : (
          <>
            <button onClick={() => setIsAuthModalOpen(true)}>
              <span aria-hidden="true">→]</span> Sign in
            </button>
            <button className={view === "contact" ? "active" : ""} onClick={() => openPage("contact")}>
              <span aria-hidden="true">✉</span> Contact
            </button>
          </>
        )}
      </nav>

      <footer className="ls-footer">
        <div className="ls-footer-content">
          <button className="ls-brand ls-brand-button" onClick={() => openPage("catalog")}>
            <img className="ls-brand-mark" src="/favicon-48.png" alt="" width="30" height="30" />
            <span className="ls-brand-name">LearnSpace</span>
          </button>
          <p>Learn something useful today.</p>
          <div className="ls-footer-links">
            {FOOTER_PAGES.map((page) => (
              <button
                key={page.id}
                type="button"
                className={view === page.id ? "active" : ""}
                onClick={() => openPage(page.id)}
              >
                {page.label}
              </button>
            ))}
          </div>
          <small>&copy; 2026 LearnSpace Inc. All rights reserved.</small>
        </div>
      </footer>
    </div>
  );
}

const numberFormat = new Intl.NumberFormat("en-US");

/**
 * Every figure here comes from /api/stats, which counts documents in the
 * database. A metric is omitted entirely when the API has no real value for it.
 */
/** One enrolled course with its progress bar and per-lesson checklist. */
function MyCourseRow({ course, onOpen, onToggleLesson }) {
  const [expanded, setExpanded] = useState(false);
  const done = course.percentComplete === 100;

  return (
    <article className={`ls-progress-card ${done ? "is-done" : ""}`}>
      <div className="ls-progress-main">
        <div className="ls-progress-info">
          <div className="ls-progress-toprow">
            <span className="ls-pill">{course.category}</span>
            <span className="ls-pill">{course.level}</span>
            {done && <span className="ls-pill done">Completed</span>}
          </div>

          <h3>{course.title}</h3>

          <div className="ls-learning-meta">
            <span>{course.teacher}</span>
            <span>
              {course.amountPaid > 0
                ? `Paid ${formatMoney(course.amountPaid, course.currency)}`
                : "Free"}
            </span>
          </div>
        </div>

        <div className="ls-progress-stat">
          <div
            className="ls-progress-ring"
            style={{ "--ls-pct": `${course.percentComplete}` }}
            role="img"
            aria-label={`${course.percentComplete}% complete`}
          >
            <span>{course.percentComplete}%</span>
          </div>
          <small>
            {course.completedLessons} of {course.totalLessons} lessons
          </small>
        </div>
      </div>

      <div className="ls-progress-track" aria-hidden="true">
        <i style={{ width: `${course.percentComplete}%` }} />
      </div>

      <div className="ls-progress-actions">
        <button className="ls-button ls-button-blue ls-button-small" onClick={onOpen}>
          {course.percentComplete > 0 && !done ? "Resume" : done ? "Revisit" : "Start"}
        </button>
        <button
          className="ls-button ls-button-outline ls-button-small"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide lessons" : `Lessons (${course.totalLessons})`}
        </button>
      </div>

      {expanded && (
        <ul className="ls-progress-lessons">
          {course.lessons.map((lesson, index) => (
            <li key={lesson.id}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(lesson.completed)}
                  onChange={(event) => onToggleLesson(lesson, event.target.checked)}
                />
                <span className="ls-progress-lesson-num">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="ls-progress-lesson-title">{lesson.title}</span>
                <small>{lesson.duration}</small>
              </label>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function SearchField({ query, onChange, className = "", autoFocus = false }) {
  return (
    <form
      className={`ls-search ${query ? "has-value" : ""} ${className}`}
      role="search"
      onSubmit={(event) => event.preventDefault()}
    >
      <span className="ls-search-icon" aria-hidden="true">⌕</span>
      <input
        type="search"
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search courses, topics, instructors"
        aria-label="Search courses"
      />
      {query && (
        <button
          type="button"
          className="ls-search-clear"
          onClick={() => onChange("")}
          aria-label="Clear search"
        >
          ✕
        </button>
      )}
    </form>
  );
}

function CatalogFacts({ stats }) {
  const facts = [
    { value: stats.totalCourses, label: "Courses" },
    { value: stats.freeCourses, label: "Free to watch" },
    { value: stats.totalLessons, label: "Lessons" },
    { value: stats.categories, label: "Categories" },
    stats.avgRating != null
      ? { value: stats.avgRating.toFixed(1), label: "Average rating", raw: true }
      : null,
  ].filter((fact) => fact && (fact.raw || Number.isFinite(fact.value)));

  if (!facts.length) return null;

  return (
    <div className="ls-facts">
      {facts.map((fact) => (
        <div className="ls-fact" key={fact.label}>
          <strong>{fact.raw ? fact.value : numberFormat.format(fact.value)}</strong>
          <small>{fact.label}</small>
        </div>
      ))}
    </div>
  );
}

function PageShell({ eyebrow, title, lead, children }) {
  return (
    <section className="ls-shell ls-page ls-view">
      <div className="ls-page-head">
        <div className="ls-section-label">{eyebrow}</div>
        <h1>{title}</h1>
        {lead && <p className="ls-page-lead">{lead}</p>}
      </div>
      <div className="ls-prose">{children}</div>
    </section>
  );
}

function AboutPage({ onBrowse }) {
  return (
    <PageShell
      eyebrow="About us"
      title="Built for people who finish what they start."
      lead="LearnSpace is a small, focused course platform. We keep lessons short, practical, and honest about what you will be able to do when they end."
    >
      <h2>Why we built this</h2>
      <p>
        Most course libraries optimise for hours of video. We optimise for the moment after a lesson,
        when you should know exactly what to try next. Every course in the catalogue is picked because
        it teaches a skill you can practise the same day.
      </p>

      <h2>How the catalogue works</h2>
      <ul>
        <li>Each course is grouped by category, level, and price so you can filter quickly.</li>
        <li>Video playback is only requested after you are enrolled, never before.</li>
        <li>Free courses stay free. Paid access is confirmed on the server, not in the browser.</li>
      </ul>

      <h2>What we care about</h2>
      <ul>
        <li><strong>Clarity.</strong> Plain descriptions, no inflated promises.</li>
        <li><strong>Accessibility.</strong> Keyboard navigation, visible focus, readable contrast.</li>
        <li><strong>Privacy.</strong> We collect the minimum needed to run your account.</li>
      </ul>

      <div className="ls-page-cta">
        <button className="ls-button ls-button-blue" onClick={onBrowse}>Browse courses</button>
        <a className="ls-button ls-button-outline" href={`mailto:${CONTACT_EMAIL}`}>Get in touch</a>
      </div>
    </PageShell>
  );
}

function PrivacyPage() {
  return (
    <PageShell
      eyebrow="Privacy policy"
      title="What we collect, and why."
      lead="Last updated August 2026. This policy covers the LearnSpace website and API."
    >
      <h2>Information we collect</h2>
      <ul>
        <li><strong>Account details.</strong> Your name, email address, and a hashed password. We never store your password in readable form.</li>
        <li><strong>Learning activity.</strong> Which courses you enrol in, so your library and progress persist.</li>
        <li><strong>Technical data.</strong> Basic request logs used to keep the service running and to debug errors.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Your data is used to authenticate you, show your enrolled courses, and protect paid lessons.
        We do not sell personal data and we do not run third-party advertising trackers.
      </p>

      <h2>Third-party services</h2>
      <ul>
        <li>Course videos are embedded from YouTube using its privacy-enhanced player.</li>
        <li>Payments, when applicable, are handled by Stripe. Card details never reach our servers.</li>
        <li>Course data is stored in MongoDB Atlas.</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        You can request a copy of your data or ask us to delete your account at any time by emailing{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Deletion removes your account and
        enrolment records.
      </p>

      <h2>Cookies and local storage</h2>
      <p>
        We store an access token in your browser so you stay signed in. Clearing site data signs you out.
        No advertising cookies are set.
      </p>
    </PageShell>
  );
}

function TermsPage() {
  return (
    <PageShell
      eyebrow="Terms of service"
      title="The agreement, in plain language."
      lead="Last updated August 2026. By creating an account you agree to these terms."
    >
      <h2>Your account</h2>
      <p>
        You are responsible for keeping your credentials secure and for activity under your account.
        One account per person. Tell us promptly if you think someone else has access.
      </p>

      <h2>Course access</h2>
      <ul>
        <li>Free courses are available to any signed-in learner.</li>
        <li>Paid courses unlock after payment is confirmed, and access is verified on every request.</li>
        <li>Access is for personal learning. Redistributing or reselling course content is not permitted.</li>
      </ul>

      <h2>Content and ownership</h2>
      <p>
        Course videos remain the property of their original creators and are embedded from their
        hosting platforms. Descriptions, catalogue structure, and the LearnSpace name belong to us.
      </p>

      <h2>Refunds</h2>
      <p>
        If a paid course is not what was described, email us within 14 days of purchase and we will
        refund it. Refunded enrolments lose access to the course.
      </p>

      <h2>Availability</h2>
      <p>
        We aim to keep LearnSpace online but cannot guarantee uninterrupted service. Third-party
        video sources may occasionally remove content that we then replace or remove from the catalogue.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Material changes will be announced on this page, and continuing to
        use the service means you accept the update.
      </p>
    </PageShell>
  );
}

function ContactPage() {
  return (
    <PageShell
      eyebrow="Contact"
      title="Talk to a human."
      lead="Questions about a course, your account, billing, or a bug you found. Send it over and we will get back to you."
    >
      <div className="ls-contact-grid">
        <div className="ls-contact-card">
          <div className="ls-contact-icon" aria-hidden="true">✉</div>
          <h3>Email</h3>
          <p>Best for support, refunds, and privacy requests. We usually reply within two business days.</p>
          <a className="ls-contact-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </div>

        <div className="ls-contact-card">
          <div className="ls-contact-icon" aria-hidden="true">◎</div>
          <h3>Website</h3>
          <p>The live LearnSpace catalogue. Include the page URL when reporting an issue.</p>
          <a
            className="ls-contact-link"
            href={SITE_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            learn-space-coral.vercel.app
          </a>
        </div>
      </div>

      <h2>Before you write</h2>
      <ul>
        <li><strong>Course problem?</strong> Include the course title and the lesson number.</li>
        <li><strong>Cannot sign in?</strong> Tell us the email on the account, never your password.</li>
        <li><strong>Billing question?</strong> Include the date and last four digits of the card used.</li>
      </ul>

      <div className="ls-page-cta">
        <a
          className="ls-button ls-button-blue"
          href={`mailto:${CONTACT_EMAIL}?subject=LearnSpace%20support%20request`}
        >
          Email support
        </a>
      </div>
    </PageShell>
  );
}

function CourseCard({ course, onOpen, owned = false }) {
  return (
    <button className="ls-course-card" onClick={onOpen}>
      <div className="ls-card-topline">
        <span>{course.category}</span>
        <span>{course.level}</span>
      </div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="ls-card-meta">
        <span>★ {Number(course.rating || 0).toFixed(1)}</span>
        <span>{course.teacher}</span>
      </div>
      <div className="ls-card-foot">
        <strong>{course.price ? formatPrice(course.price, course.currency) : "Free"}</strong>
        {owned ? (
          <span className="ls-pill owned">Owned</span>
        ) : (
          <span className={course.price ? "ls-pill" : "ls-pill free"}>
            {course.price ? "Paid" : "Free"}
          </span>
        )}
      </div>
    </button>
  );
}

function LessonPlayer({ course, lesson, locked, playback, onPlay, onEnroll }) {
  if (locked) {
    return (
      <div className="ls-player">
        <div className="ls-locked">
          <div>
            <div className="ls-lock" aria-hidden="true">🔒</div>
            <h3>Enrollment required</h3>
            <p>
              The video URL is not sent to your browser until the server confirms
              your payment.
            </p>
            <button className="ls-button ls-button-blue" onClick={onEnroll}>
              Buy for {formatPrice(course.price, course.currency)}
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (playback.status === "ready") {
    return (
      <div className="ls-player">
        <iframe src={playback.url} title={lesson.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  return (
    <div className="ls-player">
      <button className="ls-play" onClick={onPlay} disabled={playback.status === "loading"}>
        {playback.status === "loading" ? "…" : "▶"}
      </button>
      {playback.status === "error" && (
        <p className="ls-play-error">{playback.message || "Playback could not be verified."}</p>
      )}
    </div>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages < 2) return null;

  // Keep the control compact by windowing page numbers around the current page.
  const window = 2;
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    const inWindow = Math.abs(p - page) <= window;
    if (p === 1 || p === totalPages || inWindow) pages.push(p);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }

  return (
    <nav className="ls-pagination" aria-label="Course pages">
      <button className="ls-page-btn" disabled={page === 1} onClick={() => onChange(page - 1)}>
        Prev
      </button>
      <div className="ls-page-numbers">
        {pages.map((p, index) =>
          p === "gap" ? (
            <span className="ls-page-gap" key={`gap-${index}`}>…</span>
          ) : (
            <button
              key={p}
              className={`ls-page-btn ${p === page ? "active" : ""}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          ),
        )}
      </div>
      <button className="ls-page-btn" disabled={page === totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}

function CourseSkeleton() {
  return (
    <div className="ls-course-grid" aria-label="Loading courses">
      {Array.from({ length: 6 }, (_, i) => <div className="ls-skeleton" key={i} />)}
    </div>
  );
}

function EmptyState({ query, onReset }) {
  return (
    <div className="ls-empty">
      <h2>No courses found</h2>
      <p>
        {query
          ? `Nothing matched “${query}”. Try a shorter or different term.`
          : "Nothing matches these filters. Try widening them."}
      </p>
      <button className="ls-button ls-button-outline" onClick={onReset}>Clear search and filters</button>
    </div>
  );
}
