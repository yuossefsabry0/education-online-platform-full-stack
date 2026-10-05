import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
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

  useEffect(() => {
    if (confirmingId === null) return;
    function onKeyDown(e) {
      if (e.key === "Escape") setConfirmingId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirmingId]);

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

  const confirmingSub = subscriptions.find((s) => s.id === confirmingId) || null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>My Subscriptions</h1>
          <p className="muted">Manage your active subscriptions below. Lectures are available from My Lectures.</p>
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
                  {sub.endDate ? (
                    <span className="muted small">Active until {new Date(sub.endDate).toLocaleDateString()}</span>
                  ) : null}
                </div>
                <span className="role-badge">Subscribed</span>
                <div className="btn-row" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmingId(sub.id)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmingSub ? (
        <div
          className="modal-overlay"
          onClick={() => {
            if (!cancelling) setConfirmingId(null);
          }}
        >
          <div
            className="modal-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="cancel-sub-title"
            aria-describedby="cancel-sub-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="modal-icon" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M12 3 1.8 20.2h20.4L12 3zm0 6.2v4.4m0 2.9v.1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <h2 id="cancel-sub-title">Cancel subscription?</h2>
            <p id="cancel-sub-desc" className="muted">
              You are about to cancel your subscription
              {confirmingSub.teacher && confirmingSub.teacher.name ? (
                <> with <strong>Mr. {confirmingSub.teacher.name}</strong></>
              ) : null}
              . You will immediately lose access to their lectures, lesson content, and homework.
              This action cannot be undone.
            </p>
            <div className="btn-row modal-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={cancelling}
                onClick={() => setConfirmingId(null)}
              >
                Keep my subscription
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={cancelling}
                onClick={() => handleCancel(confirmingSub.id)}
              >
                {cancelling ? "Cancelling..." : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
