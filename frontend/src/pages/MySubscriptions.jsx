import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import TeacherImage from "../components/TeacherImage.jsx";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// Student "My Subscriptions" page (backend: subscription.controller listMine):
// - GET /api/subscriptions/mine -> { subscriptions: [{ id, duration, endDate, teacher }] }
// Shows instructors the student has actively subscribed to; clicking an
// instructor opens that instructor's content.
export default function MySubscriptions() {
  const navigate = useNavigate();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmingId, setConfirmingId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [actionError, setActionError] = useState(null);

  const loadMine = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.mySubscriptions();
      setSubscriptions(data.subscriptions || []);
    } catch (err) {
      setSubscriptions([]);
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMine();
  }, [loadMine]);

  async function handleCancel(subscriptionId) {
    setActionError(null);
    setCancelling(true);
    try {
      await endpoints.cancelSubscription(subscriptionId);
      setConfirmingId(null);
      await loadMine();
    } catch (err) {
      setActionError(toApiError(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Subscriptions</h1>
          <p className="muted">Instructors you have subscribed to. Select an instructor to view their content.</p>
        </div>
      </div>

      {actionError ? <ErrorBox error={actionError} /> : null}
      {loading ? (
        <Loader label="Loading your subscriptions..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={loadMine} />
      ) : subscriptions.length === 0 ? (
        <EmptyState
          title="You haven't subscribed to any instructors yet"
          hint="Browse qualified teachers, choose a plan, and unlock their lectures, lesson content, and homework."
          action={
            <div className="btn-row" style={{ justifyContent: "center", marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate("/teachers")}>
                Browse teachers
              </button>
            </div>
          }
        />
      ) : (
        <div className="teacher-grid">
          {subscriptions.map((sub) => {
            const teacher = sub.teacher || {};
            return (
              <article key={sub.id} className="teacher-card">
                <div className="card-media img-zoom">
                  <TeacherImage teacher={teacher} />
                </div>
                <div className="teacher-card-body">
                  <h3>{teacher.name}</h3>
                  <p className="muted">
                    {teacher.subject} · {teacher.gradeClass}
                  </p>
                  {sub.endDate ? (
                    <p className="muted small">Active until {new Date(sub.endDate).toLocaleDateString()}</p>
                  ) : null}
                  <div className="btn-row">
                    <button
                      type="button"
                      className="btn btn-dark btn-sm"
                      onClick={() => navigate(`/content/teacher/${teacher.id}`)}
                    >
                      View content
                    </button>
                    {confirmingId === sub.id ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={cancelling}
                        onClick={() => handleCancel(sub.id)}
                      >
                        {cancelling ? "Cancelling..." : "Confirm cancel"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setConfirmingId(sub.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
