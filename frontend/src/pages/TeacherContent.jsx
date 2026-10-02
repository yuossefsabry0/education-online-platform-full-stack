import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { downloadStoredFile, endpoints, isSafeFileUrl, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

// Subscribed-student content workflow (backend: content.controller):
// - GET /api/content/teacher/:teacherId -> { teacher, sections }
// - GET /api/content/teacher/:teacherId/:section (lectures|lesson-content|homework)
// Requires an ACTIVE subscription (role SUB{teacherId}); otherwise 403.
const SECTION_KEYS = ["lectures", "lesson-content", "homework"];

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

  async function openStoredFile(fileUrl, title) {
    try {
      const blob = await downloadStoredFile(fileUrl);
      const url = window.URL.createObjectURL(blob);
      window.open(url, "_blank", "noreferrer");
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
              This teacher&apos;s lectures, lesson content, and homework are available to students
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
  const SECTION_HINTS = {
    lectures: "Watch and review each lecture in order. Open any attachments for slides or notes.",
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
            {sectionKeys.length} sections
            {sectionData && sectionData.label ? ` · Now viewing: ${sectionData.label}` : ` · Now viewing: ${activeLabel}`}
          </p>
        </div>
        <span className="role-badge">{activeLabel}</span>
      </div>

      <div className="tabs" role="tablist" aria-label="Content sections">
        {sectionKeys.map((key) => {
          const label = key === "lesson-content" ? "Lesson Content" : key.charAt(0).toUpperCase() + key.slice(1);
          const isActive = sectionKey === key;
          return (
            <button
              key={key}
              type="button"
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
        <>
        <div className="content-list">
          {items.map((item, index) => (
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
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openStoredFile(item.fileUrl, item.title)}>
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
          ))}
        </div>
        {sectionPagination && sectionPagination.totalPages > 1 ? (
          <Pagination page={sectionPagination.page} totalPages={sectionPagination.totalPages} onChange={setSectionPage} />
        ) : null}
        </>
      )}
    </div>
  );
}
