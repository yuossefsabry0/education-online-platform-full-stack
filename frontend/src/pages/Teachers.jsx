import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import TeacherImage from "../components/TeacherImage.jsx";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

// GET /api/teachers/search?q=... (when searching) or GET /api/teachers (browsing).
// Public response fields: id, name, subject, gradeClass (+ pagination).
export default function Teachers() {
  const navigate = useNavigate();
  const { userType } = useAuth();
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [teachers, setTeachers] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                    ) : null}
                  </div>
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
