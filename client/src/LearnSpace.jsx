import React, { useMemo, useState } from "react";
import "./learnspace.css";

/**
 * Production boundary:
 * - Pass real courses from your API. This component never invents ratings, views,
 *   student counts, or video metadata.
 * - `user.enrollments` is the source of truth for access.
 * - `onPlayLesson` should verify access server-side before returning a playback URL.
 * - `onEnroll` should create/confirm the enrollment through your backend.
 */
export default function LearnSpace({
  courses = [],
  user = null,
  loading = false,
  error = "",
  onLogin,
  onLogout,
  onEnroll,
  onPlayLesson,
  onRetry,
}) {
  const [view, setView] = useState("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [price, setPrice] = useState("all");
  const [level, setLevel] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [pageSize, setPageSize] = useState(24);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [selectedLesson, setSelectedLesson] = useState(0);
  const [playback, setPlayback] = useState({ status: "idle", url: "" });

  const categories = useMemo(
    () => ["All", ...new Set(courses.map((course) => course.category).filter(Boolean))],
    [courses],
  );

  const enrolledIds = useMemo(
    () => new Set(user?.enrollments ?? []),
    [user?.enrollments],
  );

  const filteredCourses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const result = courses.filter((course) => {
      const searchable = [course.title, course.description, course.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (category === "All" || course.category === category) &&
        (price === "all" || (price === "free" ? course.price === 0 : course.price > 0)) &&
        (level === "all" || course.level === level) &&
        (!normalizedQuery || searchable.includes(normalizedQuery))
      );
    });

    return result.sort((a, b) => {
      if (sort === "low") return (a.price ?? 0) - (b.price ?? 0);
      if (sort === "high") return (b.price ?? 0) - (a.price ?? 0);
      if (sort === "new") return new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0);
      return String(a.title).localeCompare(String(b.title));
    });
  }, [courses, query, category, price, level, sort]);

  const currentCourse = selectedCourse
    ? courses.find((course) => course.id === selectedCourse)
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

  async function requestPlayback() {
    if (!currentCourse || !currentLesson) return;
    if (requiresEnrollment) return;

    setPlayback({ status: "loading", url: "" });
    try {
      const url = await onPlayLesson({ courseId: currentCourse.id, lessonId: currentLesson.id });
      setPlayback({ status: "ready", url });
    } catch {
      setPlayback({ status: "error", url: "" });
    }
  }

  async function enroll() {
    if (!currentCourse) return;
    if (!user) return onLogin?.();
    await onEnroll?.(currentCourse.id);
  }

  if (!user) {
    return (
      <div className="ls-auth-shell">
        <div className="ls-auth-panel">
          <div className="ls-brand"><span>L</span> LearnSpace</div>
          <h1>Learn something useful.</h1>
          <p>Short, practical courses with a clear next step after every lesson.</p>
          <button className="ls-button ls-button-blue" onClick={onLogin}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ls-app">
      <header className="ls-topbar">
        <button className="ls-brand ls-brand-button" onClick={() => setView("catalog")} aria-label="Go to catalog">
          <span>L</span> LearnSpace
        </button>
        <nav className="ls-nav" aria-label="Primary navigation">
          <button className={view === "catalog" ? "active" : ""} onClick={() => setView("catalog")}>Browse</button>
          <button className={view === "learning" ? "active" : ""} onClick={() => setView("learning")}>My learning</button>
        </nav>
        <label className="ls-search">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPageSize(24); }}
            placeholder="Search courses"
            aria-label="Search courses"
          />
        </label>
        <div className="ls-account">
          <span className="ls-avatar">{user.name?.slice(0, 2).toUpperCase()}</span>
          <span className="ls-account-copy"><strong>{user.name}</strong><small>{user.role}</small></span>
          <button className="ls-button ls-button-outline ls-button-small" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <main className="ls-main">
        {error && (
          <div className="ls-alert" role="alert">
            {error}<button onClick={onRetry}>Retry</button>
          </div>
        )}

        {view === "catalog" && (
          <section className="ls-shell" aria-labelledby="catalog-heading">
            <div className="ls-hero">
              <div><h1 id="catalog-heading">Learn something <em>useful.</em></h1></div>
              <p>Short, practical courses with a clear next step after every lesson.</p>
            </div>
            <div className="ls-facts">
              <div><strong>{courses.length}</strong><small>catalog courses</small></div>
              <div><strong>{courses.filter((course) => course.price === 0).length}</strong><small>free to start</small></div>
              <div><strong>{categories.length - 1}</strong><small>learning areas</small></div>
            </div>
            <div className="ls-filter-row" role="list" aria-label="Course categories">
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? "ls-chip active" : "ls-chip"}
                  onClick={() => { setCategory(item); setPageSize(24); }}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="ls-toolbar">
              <label>Price <select value={price} onChange={(e) => setPrice(e.target.value)}><option value="all">All</option><option value="free">Free</option><option value="paid">Paid</option></select></label>
              <label>Level <select value={level} onChange={(e) => setLevel(e.target.value)}><option value="all">All</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
              <label>Sort <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="recommended">Recommended order</option><option value="new">Recently added</option><option value="low">Price low</option><option value="high">Price high</option></select></label>
              <span className="ls-count">{Math.min(pageSize, filteredCourses.length)} of {filteredCourses.length}</span>
            </div>
            {loading ? (
              <CourseSkeleton />
            ) : (
              <>
                <div className="ls-section-label">{category === "All" ? "All courses" : category}</div>
                <div className="ls-course-grid">
                  {filteredCourses.slice(0, pageSize).map((course) => (
                    <CourseCard key={course.id} course={course} onOpen={() => openCourse(course.id)} />
                  ))}
                </div>
                {pageSize < filteredCourses.length && (
                  <div className="ls-more">
                    <button className="ls-button ls-button-outline" onClick={() => setPageSize((s) => s + 24)}>Load more</button>
                  </div>
                )}
              </>
            )}
            {!loading && !filteredCourses.length && (
              <EmptyState onReset={() => { setQuery(""); setCategory("All"); setPrice("all"); setLevel("all"); }} />
            )}
          </section>
        )}

        {view === "lesson" && currentCourse && (
          <section className="ls-shell">
            <button className="ls-back" onClick={() => setView("catalog")}>← Back to courses</button>
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
                <strong className="ls-price">{currentCourse.price ? `$${currentCourse.price}` : "Free"}</strong>
                <button className="ls-button ls-button-blue ls-wide" onClick={isEnrolled ? requestPlayback : enroll}>
                  {isEnrolled ? "Continue course" : currentCourse.price ? "Pay and enroll" : "Enroll free"}
                </button>
                <ul>
                  <li>Lessons <b>{currentCourse.lessons.length}</b></li>
                  <li>Level <b>{currentCourse.level}</b></li>
                  <li>Access <b>Lifetime</b></li>
                  <li>Playback <b>After enrollment</b></li>
                </ul>
              </aside>
            </div>
          </section>
        )}

        {view === "learning" && (
          <section className="ls-shell">
            <div className="ls-hero">
              <h1>Keep <em>going.</em></h1>
              <p>Only enrolled courses appear here.</p>
            </div>
            <div className="ls-learning-list">
              {courses.filter((course) => enrolledIds.has(course.id)).map((course) => (
                <div className="ls-learning-row" key={course.id}>
                  <div>
                    <h3>{course.title}</h3>
                    <div className="ls-progress"><i /></div>
                  </div>
                  <button className="ls-button ls-button-blue ls-button-small" onClick={() => openCourse(course.id)}>Open course</button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function CourseCard({ course, onOpen }) {
  return (
    <button className="ls-course-card" onClick={onOpen}>
      <div className="ls-card-topline">
        <span>{course.category}</span>
        <span>{course.level}</span>
      </div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>
      <div className="ls-card-foot">
        <strong>{course.price ? `$${course.price}` : "Free"}</strong>
        <span className={course.price ? "ls-pill" : "ls-pill free"}>{course.price ? "Paid" : "Free"}</span>
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
            <div className="ls-lock">🔒</div>
            <h3>Enrollment required</h3>
            <p>This paid course does not request or load video until payment is confirmed.</p>
            <button className="ls-button ls-button-blue" onClick={onEnroll}>Pay ${course.price} and enroll</button>
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
      {playback.status === "error" && <p className="ls-play-error">Playback could not be verified. Try again.</p>}
    </div>
  );
}

function CourseSkeleton() {
  return (
    <div className="ls-course-grid" aria-label="Loading courses">
      {Array.from({ length: 6 }, (_, i) => <div className="ls-skeleton" key={i} />)}
    </div>
  );
}

function EmptyState({ onReset }) {
  return (
    <div className="ls-empty">
      <h2>No courses found</h2>
      <p>Try a different search or clear your filters.</p>
      <button className="ls-button ls-button-outline" onClick={onReset}>Clear filters</button>
    </div>
  );
}
