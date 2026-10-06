import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import TeacherImage from "../components/TeacherImage.jsx";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";
import { formatPrice } from "../utils/format.js";

// Admin inline snapshot (additive): full teacher details on the teachers
// route — lecture/student counts, prices, and unrestricted content access.
function AdminTeacherSnapshot({ teacher, snapshot, onGoToContent, onManage }) {
  if (!snapshot || snapshot.loading) {
    return <p className="muted small" style={{ marginTop: "0.75rem" }}>Loading teacher details...</p>;
  }
  if (snapshot.error) {
    return <p className="muted small" role="alert" style={{ marginTop: "0.75rem" }}>Could not load details: {snapshot.error.message}</p>;
  }
  const detailTeacher = (snapshot.detail && snapshot.detail.teacher) || teacher;
  const contents = detailTeacher.contents || [];
  const lectureCount = contents.filter((c) => c.type === "LECTURE").length;
  return (
    <div className="admin-teacher-snapshot">
      <div className="admin-snapshot-row">
        <span className="muted small">Lectures</span>
        <strong>{lectureCount}</strong>
      </div>
      <div className="admin-snapshot-row">
        <span className="muted small">Students</span>
        <strong>{snapshot.studentCount ?? "—"}</strong>
      </div>
      <div className="admin-snapshot-row">
        <span className="muted small">Prices (1m / 3m / 6m / 1y)</span>
        <strong>{[detailTeacher.price1Month, detailTeacher.price3Months, detailTeacher.price6Months, detailTeacher.price1Year].map(formatPrice).join(" / ")}</strong>
      </div>
      <div className="btn-row">
        <button type="button" className="btn btn-dark btn-sm" onClick={onGoToContent}>
          Go to Content
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onManage}>
          Manage
        </button>
      </div>
    </div>
  );
}

// GET /api/teachers/search?q=... (when searching) or GET /api/teachers (browsing).
// Public response fields: id, name, subject, gradeClass (+ pagination).
export default function Teachers() {
  const navigate = useNavigate();
  const { userType } = useAuth();
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(() => (searchParams.get("q") || "").trim());
  const [appliedQuery, setAppliedQuery] = useState(() => (searchParams.get("q") || "").trim());
  const [page, setPage] = useState(1);
  const [teachers, setTeachers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Admin inline "View" snapshot (additive): full details per teacher on demand.
  const [viewId, setViewId] = useState(null);
  const [viewCache, setViewCache] = useState({});

  const fetchTeachers = useCallback(
    async (q, p) => {
      setLoading(true);
      setError(null);
      try {
        // The backend search endpoint uses `q`; empty query returns an empty
        // list there, so browsing uses the plain list endpoint instead.
        const data = q
          ? await endpoints.searchTeachers({ q, page: p, limit: 9 })
          : await endpoints.listTeachers({ page: p, limit: 9 });
        setTeachers(data.teachers || []);
        setPagination(data.pagination || null);
      } catch (err) {
        setError(toApiError(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    const q = (searchParams.get("q") || "").trim();
    setQuery(q);
    setAppliedQuery(q);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    if (userType === "teacher") {
      setLoading(false);
      return;
    }
    fetchTeachers(appliedQuery, page);
  }, [fetchTeachers, appliedQuery, page, userType]);

  if (userType === "teacher") {
    return (
      <div className="page">
        <div className="page-head">
          <div>
            <h1>Teachers</h1>
            <p className="muted">Teacher accounts focus on their own dashboard and content.</p>
          </div>
        </div>
        <EmptyState
          title="Not available for teacher accounts"
          hint="Browsing other teachers is disabled for teachers. Go to your dashboard to manage your lessons and students."
        />
        <div className="btn-row" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teacher/dashboard")}>
            Go to my dashboard
          </button>
        </div>
      </div>
    );
  }

  function handleSearch(e) {
    e.preventDefault();
    setPage(1);
    setAppliedQuery(query.trim());
  }

  async function toggleAdminView(teacher) {
    if (viewId === teacher.id) {
      setViewId(null);
      return;
    }
    setViewId(teacher.id);
    if (viewCache[teacher.id]) return;
    setViewCache((c) => ({ ...c, [teacher.id]: { loading: true, error: null, detail: null, studentCount: null } }));
    try {
      const [d, s] = await Promise.all([
        endpoints.adminTeacherDetail(teacher.id),
        endpoints.adminTeacherSubscribers(teacher.id, { page: 1, limit: 1 }),
      ]);
      setViewCache((c) => ({
        ...c,
        [teacher.id]: {
          loading: false,
          error: null,
          detail: d,
          studentCount: s && typeof s.totalSubscribers === "number"
            ? s.totalSubscribers
            : ((d && d.teacher && d.teacher.subscriptions) || []).length,
        },
      }));
    } catch (err) {
      setViewCache((c) => ({ ...c, [teacher.id]: { loading: false, error: toApiError(err), detail: null, studentCount: null } }));
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Teachers</h1>
          <p className="muted">Search registered teachers and subscribe to their courses.</p>
        </div>
      </div>

      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="search"
          placeholder="Search teachers by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search teachers"
        />
        <button type="submit" className="btn btn-dark">
          Search
        </button>
        {appliedQuery ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setQuery("");
              setAppliedQuery("");
              setPage(1);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>

      {loading ? (
        <Loader label="Loading teachers..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={() => fetchTeachers(appliedQuery, page)} />
      ) : teachers.length === 0 ? (
        <EmptyState
          title="No teachers found"
          hint={appliedQuery ? "Try a different search term." : "No teachers are registered yet."}
        />
      ) : (
        <>
          <div className="teacher-grid">
            {teachers.map((teacher) => (
              <article key={teacher.id} className="teacher-card">
                <div className="card-media img-zoom">
                  <TeacherImage teacher={teacher} />
                </div>
                <div className="teacher-card-body">
                  <h3>{teacher.name}</h3>
                  <p className="muted">
                    {teacher.subject} · {teacher.gradeClass}
                  </p>
                  <div className="btn-row">
                    {userType === "student" ? (
                      <>
                        <button
                          type="button"
                          className="btn btn-dark btn-sm"
                          onClick={() => navigate(`/teachers/${teacher.id}/subscribe`)}
                        >
                          Subscribe
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => navigate(`/content/teacher/${teacher.id}`)}
                        >
                          View content
                        </button>
                      </>
                    ) : !userType ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate("/login", { state: { from: `/content/teacher/${teacher.id}` } })}
                      >
                        View content
                      </button>
                    ) : userType === "admin" ? (
                      <button
                        type="button"
                        className="btn btn-dark btn-sm"
                        onClick={() => toggleAdminView(teacher)}
                        aria-expanded={viewId === teacher.id}
                      >
                        {viewId === teacher.id ? "Hide" : "View"}
                      </button>
                    ) : null}
                  </div>
                  {userType === "admin" && viewId === teacher.id ? (
                    <AdminTeacherSnapshot
                      teacher={teacher}
                      snapshot={viewCache[teacher.id]}
                      onGoToContent={() => navigate(`/content/teacher/${teacher.id}`)}
                      onManage={() => navigate(`/admin/teachers/${teacher.id}`)}
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
          <Pagination page={pagination?.page || page} totalPages={pagination?.totalPages || 0} onChange={setPage} />
        </>
      )}
    </div>
  );
}
