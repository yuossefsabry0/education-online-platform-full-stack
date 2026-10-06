import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadStoredFile, endpoints, isSafeFileUrl, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

// Subscribed-student content workflow (backend: content.controller):
// - GET /api/content/teacher/:teacherId -> { teacher, sections }
// - GET /api/content/teacher/:teacherId/:section (lectures|lesson-content|homework)
// Requires an ACTIVE subscription (role SUB{teacherId}); otherwise 403.
const SECTION_KEYS = ["lectures", "lesson-content", "homework"];

// Standalone exams (additive): the instructor can publish an exam as its own
// lecture (a LECTURE shell whose body starts with this marker + a linked exam).
// Students see it inline in the single Lectures list with an Exam badge and the
// same sequential-lock logic as every other lecture — no separate section.
const STANDALONE_EXAM_MARKER = "[standalone-exam]";

function isStandaloneExam(item) {
  return (
    item &&
    typeof item.body === "string" &&
    item.body.startsWith(STANDALONE_EXAM_MARKER)
  );
}

function standaloneExamInstructions(item) {
  if (!isStandaloneExam(item)) return "";
  return item.body.slice(STANDALONE_EXAM_MARKER.length).replace(/^\s+/, "");
}

export default function TeacherContent() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [sectionKey, setSectionKey] = useState("lectures");
  const [sectionData, setSectionData] = useState(null);
  const [sectionPagination, setSectionPagination] = useState(null);
  const [sectionPage, setSectionPage] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sectionError, setSectionError] = useState(null);
  const [sectionAttempt, setSectionAttempt] = useState(0);
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examsError, setExamsError] = useState(null);
  // Integrated tiered journey: exams grouped per lecture for sequential locks.
  // (Additive — existing section flows stay untouched.)
  const [journeyExams, setJourneyExams] = useState([]);
  const createdUrls = useRef([]);

  useEffect(() => {
    const urls = createdUrls.current;
    return () => {
      for (const u of urls) {
        try {
          window.URL.revokeObjectURL(u);
        } catch {
          continue;
        }
      }
      urls.length = 0;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await endpoints.contentPage(teacherId);
        if (!cancelled) setPage(result);
      } catch (err) {
        if (!cancelled) setError(toApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [teacherId]);

  useEffect(() => {
    if (loading || error || !page) return;
    let cancelled = false;
    async function loadSection() {
      setSectionLoading(true);
      setSectionError(null);
      try {
        const result = await endpoints.contentSection(teacherId, sectionKey, {
          page: sectionPage,
          limit: 10,
          q: appliedSearch || undefined,
        });
        if (!cancelled) {
          setSectionData(result.section || null);
          setSectionPagination(result.pagination || null);
        }
      } catch (err) {
        if (!cancelled) {
          setSectionData(null);
          setSectionPagination(null);
          setSectionError(toApiError(err));
        }
      } finally {
        if (!cancelled) setSectionLoading(false);
      }
    }
    loadSection();
    return () => {
      cancelled = true;
    };
  }, [teacherId, sectionKey, sectionPage, appliedSearch, sectionAttempt, loading, error, page]);

  useEffect(() => {
    if (loading || error || !page || sectionKey !== "homework") return;
    let cancelled = false;
    async function loadExams() {
      setExamsLoading(true);
      setExamsError(null);
      try {
        const result = await endpoints.studentExams(teacherId);
        if (!cancelled) setExams(result.exams || []);
      } catch (err) {
        if (!cancelled) {
          setExams([]);
          setExamsError(toApiError(err));
        }
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    }
    loadExams();
    return () => {
      cancelled = true;
    };
  }, [teacherId, sectionKey, loading, error, page]);

  // Preload exams for the integrated lecture tiers (sequential locks + per-lecture exam link).
  useEffect(() => {
    if (loading || error || !page) return;
    let cancelled = false;
    async function loadJourneyExams() {
      try {
        const result = await endpoints.studentExams(teacherId);
        if (!cancelled) setJourneyExams(result.exams || []);
      } catch {
        if (!cancelled) setJourneyExams([]);
      }
    }
    loadJourneyExams();
    return () => {
      cancelled = true;
    };
  }, [teacherId, loading, error, page]);

  async function openStoredFile(fileUrl, title, contentId) {
    try {
      const blob = await downloadStoredFile(fileUrl, contentId ? { params: { contentId } } : undefined);
      const url = window.URL.createObjectURL(blob);
      createdUrls.current.push(url);
      const opened = window.open(url, "_blank", "noreferrer");
      if (!opened) {
        const a = document.createElement("a");
        a.href = url;
        a.download = title || "attachment";
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => {
        try {
          window.URL.revokeObjectURL(url);
        } catch {
          return;
        }
        const idx = createdUrls.current.indexOf(url);
        if (idx !== -1) createdUrls.current.splice(idx, 1);
      }, 60000);
    } catch {
      setSectionError({ code: "DOWNLOAD_FAILED", message: `Could not open attachment${title ? ` "${title}"` : ""}.` });
    }
  }

  if (loading) return <div className="page"><Loader label="Loading content..." /></div>;
  if (error) {
    const isSubscriptionLocked =
      error.code === "SUBSCRIPTION_REQUIRED" || error.code === "NO_ACTIVE_SUBSCRIPTION";
    if (isSubscriptionLocked) {
      return (
        <div className="page">
          <h1>Course content</h1>
          <div className="empty-state">
            <h3>Subscription required to view this content</h3>
            <p className="muted">
              This teacher&apos;s lectures and exams are available to students
              with an active subscription. Subscribe to unlock the full course content.
            </p>
            <p className="muted small">Choose a 1, 3, 6, or 12-month plan, confirm payment, then return here to continue learning.</p>
            <div className="btn-row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate(`/teachers/${teacherId}/subscribe`)}>
                View subscription plans
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/teachers")}>
                Browse teachers
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="page">
        <h1>Course content</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const items = sectionData && Array.isArray(sectionData.content) ? sectionData.content : [];
  const teacher = page && page.teacher ? page.teacher : null;
  const sectionKeys =
    page && Array.isArray(page.sections) && page.sections.length
      ? page.sections.map((s) => s.key)
      : SECTION_KEYS;
  // Consolidated student view (additive): lectures, lesson content and homework
  // are layers of a single lecture, so students browse one unified Lectures list.
  // Standalone exams are published as their own lecture and appear inline here.
  // Other section fetch flows stay in code for backend compatibility.
  const visibleSectionKeys = sectionKeys.includes("lectures") ? ["lectures"] : sectionKeys;
  const SECTION_HINTS = {
    lectures: "Watch and review each lecture in order. Open any attachments for slides or notes. Standalone exams appear here as their own lecture.",
    "lesson-content": "Study notes, explanations, and reading material prepared by your teacher.",
    homework: "Practice assignments for this teacher. Complete each task and check the attachments.",
  };
  const activeLabel =
    sectionKey === "lesson-content" ? "Lesson Content" : sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
  const teacherInitial =
    teacher && teacher.name ? teacher.name.trim().charAt(0).toUpperCase() : "C";

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Course content</p>
          <h1>{teacher ? `${teacher.name} — Course content` : "Course content"}</h1>
          {teacher ? (
            <p className="muted">
              {teacher.subject} · {teacher.gradeClass}
            </p>
          ) : null}
        </div>
        <div className="btn-row">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/my-subscriptions")}>
            My subscriptions
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate("/teachers")}>
            Browse teachers
          </button>
        </div>
      </div>

      <div className="form-card" style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
        <span
          className="brand-mark"
          aria-hidden="true"
          style={{ width: "48px", height: "48px", fontSize: "1.4rem", flexShrink: 0 }}
        >
          {teacherInitial}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ margin: 0 }}>{teacher ? teacher.name : "Course content"}</h2>
          <p className="muted small" style={{ margin: "0.25rem 0 0" }}>
            {teacher ? `${teacher.subject} · ${teacher.gradeClass}` : "Published course material"}
            {" · "}
            {visibleSectionKeys.length} {visibleSectionKeys.length === 1 ? "section" : "sections"}
            {sectionData && sectionData.label ? ` · Now viewing: ${sectionData.label}` : ` · Now viewing: ${activeLabel}`}
          </p>
        </div>
        <span className="role-badge">{activeLabel}</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Content sections">
        {visibleSectionKeys.map((key) => {
          const label = key === "lesson-content" ? "Lesson Content" : key.charAt(0).toUpperCase() + key.slice(1);
          const isActive = sectionKey === key;
          return (
            <button
              key={key}
              type="button"
              id={`section-tab-${key}`}
              aria-controls="section-tabpanel"
              role="tab"
              aria-selected={isActive}
              className={isActive ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
              onClick={() => {
                setSectionKey(key);
                setSectionPage(1);
                setSearch("");
                setAppliedSearch("");
              }}
            >
              {label}
              {isActive && !sectionLoading && !sectionError ? ` (${items.length})` : ""}
            </button>
          );
        })}
      </div>

      <div className="page-head" style={{ marginTop: "0.5rem" }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>{sectionData && sectionData.label ? sectionData.label : activeLabel}</h2>
          <p className="muted small" style={{ marginBottom: 0 }}>
            {SECTION_HINTS[sectionKey] || "Course material published by your teacher."}
          </p>
        </div>
        {!sectionLoading && !sectionError && items.length > 0 ? (
          <p className="muted small" style={{ whiteSpace: "nowrap" }}>
            {items.length} {items.length === 1 ? "item" : "items"}
          </p>
        ) : null}
      </div>

      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setSectionPage(1);
          setAppliedSearch(search.trim());
        }}
      >
        <input
          type="search"
          placeholder="Search this section by title..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search section content"
        />
        <button type="submit" className="btn btn-dark btn-sm">
          Search
        </button>
        {appliedSearch ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch("");
              setAppliedSearch("");
              setSectionPage(1);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {sectionKey === "homework" ? (
        <section className="exam-panel" aria-label="Exams">
          <h2 style={{ marginBottom: "0.25rem" }}>Exams</h2>
          <p className="muted small" style={{ marginTop: 0 }}>
            Timed exams from your teacher. Open one and press Start Exam when you are ready.
          </p>
          {examsLoading ? (
            <Loader label="Loading exams..." />
          ) : examsError ? (
            <ErrorBox error={examsError} onRetry={() => endpoints.studentExams(teacherId).then((r) => setExams(r.exams || [])).catch((e) => setExamsError(toApiError(e)))} />
          ) : exams.length === 0 ? (
            <EmptyState title="No exams yet" hint="The teacher has not published any exams. Homework assignments appear below." />
          ) : (
            <div className="content-list">
              {exams.map((exam) => (
                <article key={exam.id} className="content-item exam-card">
                  <h3 style={{ marginTop: 0 }}>{exam.title}</h3>
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {exam.questionCount} {exam.questionCount === 1 ? "question" : "questions"}
                    {" · "}Time limit {Math.floor((exam.timeLimitSeconds || 600) / 60)} min
                    {exam.lesson ? ` · Lesson: ${exam.lesson.title}` : ""}
                    {exam.lastPercent !== null && exam.lastPercent !== undefined ? ` · Last score: ${exam.lastPercent}%` : ""}
                  </p>
                  <button
                    type="button"
                    className="btn btn-dark exam-start-btn"
                    onClick={() => navigate(`/content/teacher/${teacherId}/exams/${exam.id}`)}
                  >
                    Start Exam
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {sectionLoading ? (
        <Loader label={`Loading ${activeLabel.toLowerCase()}...`} />
      ) : sectionError ? (
        <ErrorBox error={sectionError} onRetry={() => setSectionAttempt((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyState
          title={`No ${activeLabel.toLowerCase()} yet`}
          hint="The teacher has not published anything in this section. Please check another section or come back later."
        />
      ) : (
        <div id="section-tabpanel" role="tabpanel">
        {sectionKey === "lectures" ? (
          <p className="muted small" style={{ marginTop: 0 }}>
            Sequential tiers: open a lecture → pass its exam (≥ 50%) → unlock material → watch the video. Each tier unlocks the next.
          </p>
        ) : null}
        <div className="content-list">
          {items.map((item, index) => {
            // Integrated Lecture tier (additive): entry shows title + details only.
            // Files/video unlock inside the journey after passing the exam.
            if (sectionKey === "lectures") {
              const linked = journeyExams.filter((e) => e.lessonContentId === item.id);
              const standalone = isStandaloneExam(item);
              const examNote = standalone ? standaloneExamInstructions(item) : "";
              const standaloneExam = standalone && linked.length === 1 ? linked[0] : null;
              const best = linked.length
                ? Math.max(...linked.map((e) => (typeof e.lastPercent === "number" ? e.lastPercent : -1)))
                : null;
              const passed = best !== null && best >= 50;
              // Sequential lock: every earlier lecture with an exam must be passed
              // (Lecture 2 needs Lecture 1, Lecture 5 needs Lectures 1–4, ...).
              let lockedByPrev = false;
              let blockingIndex = -1;
              if (index > 0) {
                for (let k = 0; k < index; k++) {
                  const prevId = items[k] ? items[k].id : null;
                  const prevExams = journeyExams.filter((e) => e.lessonContentId === prevId);
                  if (prevExams.length === 0) continue;
                  const prevBest = Math.max(...prevExams.map((e) => (typeof e.lastPercent === "number" ? e.lastPercent : -1)));
                  if (!(prevBest >= 50)) {
                    lockedByPrev = true;
                    blockingIndex = k;
                    break;
                  }
                }
              }
              const lockTip =
                blockingIndex >= 0
                  ? `Lecture ${index + 1} is locked — watch and complete Lecture ${blockingIndex + 1} first (pass its exam with ≥ 50%) to unlock it.`
                  : `Lecture ${index + 1} is locked — watch and complete the previous lectures first to unlock it.`;
              return (
                <article key={item.id} className={`content-item journey-card${lockedByPrev ? " journey-locked-card" : ""}${standalone ? " journey-card--exam" : ""}`}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
                    <span className="role-badge" aria-hidden="true">
                      {lockedByPrev ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock preview-icon" aria-hidden="true" focusable="false" style={{ verticalAlign: "-1px" }}>
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </span>
                    {standalone ? (
                      <span className="exam-badge" title="Standalone exam — pass it to unlock what follows">Exam</span>
                    ) : null}
                    <span className="muted small">
                      {standalone ? `Exam ${index + 1} of ${items.length}` : `Lecture ${index + 1} of ${items.length}`} · Tier {lockedByPrev ? "locked" : passed ? "unlocked ✓" : "1 of 4"}
                    </span>
                    <span className="muted small" style={{ marginLeft: "auto" }}>
                      Published {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "recently"}
                    </span>
                  </div>
                  <h3 style={{ marginTop: 0 }}>{item.title}</h3>
                  {standalone ? (
                    examNote ? <p style={{ whiteSpace: "pre-wrap" }}>{examNote}</p> : null
                  ) : (
                    item.body ? <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p> : null
                  )}
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    {standalone && standaloneExam
                      ? `${standaloneExam.questionCount ?? "?"} ${(standaloneExam.questionCount === 1) ? "question" : "questions"} · ${Math.floor((standaloneExam.timeLimitSeconds || 600) / 60)} min · ${passed
                        ? `Passed${best !== null ? ` · Best ${best}%` : ""} ✓`
                        : best !== null && best >= 0
                          ? `Best score ${best}% — need 50% to unlock`
                          : "Pass with 50% to unlock the next lecture"}`
                      : linked.length === 0
                      ? "Exam coming soon — material and video unlock after the exam is published."
                      : passed
                        ? `Exam passed${best !== null ? ` · Best ${best}%` : ""} — material unlocked ✓`
                        : best !== null && best >= 0
                          ? `Best score ${best}% — need 50% to unlock · ${linked.length} exam${linked.length === 1 ? "" : "s"}`
                          : `Includes ${linked.length} exam${linked.length === 1 ? "" : "s"} · Pass with 50% to unlock material + video`}
                    {lockedByPrev ? " · Complete the previous lecture first" : ""}
                  </p>
                  <div className="btn-row">
                    {lockedByPrev ? (
                      <span className="journey-lock" tabIndex={0} role="img" aria-label={lockTip} title={lockTip}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock preview-icon" aria-hidden="true" focusable="false">
                          <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span className="journey-lock-tip" role="tooltip">{lockTip}</span>
                      </span>
                    ) : standalone && standaloneExam && !passed ? (
                      <button
                        type="button"
                        className="btn btn-dark exam-start-btn"
                        title="Open this standalone exam"
                        onClick={() => navigate(`/content/teacher/${teacherId}/exams/${standaloneExam.id}`)}
                      >
                        Start Exam
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-dark exam-start-btn"
                        title="Open the lecture journey"
                        onClick={() => navigate(`/content/teacher/${teacherId}/lectures/${item.id}`)}
                      >
                        Go to Lecture
                      </button>
                    )}
                  </div>
                </article>
              );
            }
            return (
            <article key={item.id} className="content-item">
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
                <span className="role-badge" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="muted small">
                  {activeLabel} {index + 1} of {items.length}
                </span>
                <span className="muted small" style={{ marginLeft: "auto" }}>
                  Published {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "recently"}
                </span>
              </div>
              <h3 style={{ marginTop: 0 }}>{item.title}</h3>
              {item.body ? <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p> : null}
              {item.fileUrl && isSafeFileUrl(item.fileUrl) ? (
                <div className="btn-row">
                  {String(item.fileUrl).startsWith("/api/files/") ? (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openStoredFile(item.fileUrl, item.title, item.id)}>
                      Open attachment
                    </button>
                  ) : (
                    <a className="btn btn-ghost btn-sm" href={item.fileUrl} target="_blank" rel="noreferrer">
                      Open attachment
                    </a>
                  )}
                </div>
              ) : null}
              <p className="muted small" style={{ marginBottom: 0 }}>
                Published {item.createdAt ? new Date(item.createdAt).toLocaleString() : "recently"}
              </p>
            </article>
            );
          })}
        </div>
        {sectionPagination && sectionPagination.totalPages > 1 ? (
          <Pagination page={sectionPagination.page} totalPages={sectionPagination.totalPages} onChange={setSectionPage} />
        ) : null}
        </div>
      )}
    </div>
  );
}
