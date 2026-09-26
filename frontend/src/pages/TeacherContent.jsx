import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Subscribed-student content workflow (backend: content.controller):
// - GET /api/content/teacher/:teacherId -> { teacher, sections }
// - GET /api/content/teacher/:teacherId/:section (lectures|lesson-content|homework)
// Requires an ACTIVE subscription (role SUB{teacherId}); otherwise 403.
const SECTION_KEYS = ["lectures", "lesson-content", "homework"];

export default function TeacherContent() {
  const { teacherId } = useParams();
  const [page, setPage] = useState(null);
  const [sectionKey, setSectionKey] = useState("lectures");
  const [sectionData, setSectionData] = useState(null);
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
    let cancelled = false;
    async function loadSection() {
      setSectionLoading(true);
      setSectionError(null);
      try {
        const result = await endpoints.contentSection(teacherId, sectionKey);
        if (!cancelled) setSectionData(result.section || null);
      } catch (err) {
        if (!cancelled) {
          setSectionData(null);
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
  }, [teacherId, sectionKey, sectionAttempt]);

  if (loading) return <div className="page"><Loader label="Loading content..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Course content</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
        {error.code === "SUBSCRIPTION_REQUIRED" || error.code === "NO_ACTIVE_SUBSCRIPTION" ? (
          <p className="muted">An active subscription with this teacher is required to view their content.</p>
        ) : null}
      </div>
    );
  }

  const items = sectionData && sectionData.content ? sectionData.content : [];

  return (
    <div className="page">
      <h1>{page.teacher ? `${page.teacher.name} — Course content` : "Course content"}</h1>
      {page.teacher ? (
        <p className="muted">
          {page.teacher.subject} · {page.teacher.gradeClass}
        </p>
      ) : null}
      <div className="tabs" role="tablist">
        {(page.sections && page.sections.length ? page.sections.map((s) => s.key) : SECTION_KEYS).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={sectionKey === key}
            className={sectionKey === key ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
            onClick={() => setSectionKey(key)}
          >
            {key === "lesson-content" ? "Lesson Content" : key.charAt(0).toUpperCase() + key.slice(1)}
          </button>
        ))}
      </div>

      {sectionLoading ? (
        <Loader label="Loading section..." />
      ) : sectionError ? (
        <ErrorBox error={sectionError} onRetry={() => setSectionAttempt((n) => n + 1)} />
      ) : items.length === 0 ? (
        <EmptyState title="No content yet" hint="The teacher has not published anything in this section." />
      ) : (
        <div className="content-list">
          {items.map((item) => (
            <article key={item.id} className="content-item">
              <h3>{item.title}</h3>
              {item.body ? <p>{item.body}</p> : null}
              {item.fileUrl ? (
                <a href={item.fileUrl} target="_blank" rel="noreferrer">
                  Open attachment
                </a>
              ) : null}
              <p className="muted small">Published {new Date(item.createdAt).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
