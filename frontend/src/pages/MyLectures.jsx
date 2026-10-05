import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Student "My Lectures" shortcut (backend: subscription.controller listMine):
// - GET /api/subscriptions/mine -> { subscriptions: [{ id, teacher }] }
// A single subscription navigates straight to that teacher's lectures;
// several subscriptions show a teacher picker first.
export default function MyLectures() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState(null);
  const [error, setError] = useState(null);

  const loadMine = useCallback(async () => {
    setError(null);
    try {
      const data = await endpoints.mySubscriptions();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setSubscriptions(null);
      setError(toApiError(err));
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  if (error) {
    return (
      <div className="page">
        <h1>My Lectures</h1>
        <ErrorBox error={error} onRetry={loadMine} />
      </div>
    );
  }

  if (subscriptions === null) {
    return <div className="page"><Loader label="Loading your lectures..." /></div>;
  }

  if (subscriptions.length === 0) {
    return (
      <div className="page">
        <h1>My Lectures</h1>
        <EmptyState
          title="No lectures yet"
          hint="Subscribe to a teacher to unlock their lectures."
          action={
            <div className="btn-row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teachers")}>
                Browse teachers
              </button>
            </div>
          }
        />
      </div>
    );
  }

  if (subscriptions.length === 1 && subscriptions[0].teacher && subscriptions[0].teacher.id !== undefined) {
    return <Navigate to={`/content/teacher/${subscriptions[0].teacher.id}`} replace />;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Lectures</h1>
          <p className="muted">Choose a teacher to open their lectures.</p>
        </div>
      </div>
      <div className="teacher-sub-list">
        {subscriptions.map((sub) => {
          const teacher = sub.teacher || {};
          const initial = teacher.name ? teacher.name.trim().charAt(0).toUpperCase() : "M";
          return (
            <div key={sub.id} className="teacher-sub-card">
              <span className="brand-mark" aria-hidden="true">{initial}</span>
              <div className="teacher-sub-info">
                <strong>
                  <span className="muted">Mr. </span>
                  <span>{teacher.name}</span>
                </strong>
                <span className="muted small">Subject: {teacher.subject || "—"}{teacher.gradeClass ? ` · ${teacher.gradeClass}` : ""}</span>
              </div>
              <span className="role-badge">Subscribed</span>
              <div className="btn-row" style={{ marginTop: 0 }}>
                <button
                  type="button"
                  className="btn btn-dark btn-sm"
                  onClick={() => navigate(`/content/teacher/${teacher.id}`)}
                >
                  View lectures
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
