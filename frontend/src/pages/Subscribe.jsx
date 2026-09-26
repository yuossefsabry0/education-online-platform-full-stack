import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import TeacherImage from "../components/TeacherImage.jsx";
import { ErrorBox, Loader } from "../components/ui.jsx";

// Student subscription workflow (backend: subscription.controller):
// 1. GET /api/subscriptions/teacher/:teacherId -> teacher + plans + active state
// 2. POST /api/subscriptions/confirm-payment { teacherId, duration }
export default function Subscribe() {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const { userType } = useAuth();
  const [data, setData] = useState(null);
  const [duration, setDuration] = useState("ONE_MONTH");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await endpoints.subscriptionPlans(teacherId);
        if (!cancelled) setData(result);
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

  async function handleConfirm() {
    setConfirmError(null);
    setConfirming(true);
    try {
      const result = await endpoints.confirmPayment({ teacherId: Number(teacherId), duration });
      setDone(result);
    } catch (err) {
      setConfirmError(toApiError(err));
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <div className="page"><Loader label="Loading subscription plans..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Subscribe</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const teacher = data.teacher || {};
  const plans = data.plans || [];

  return (
    <div className="page page-narrow">
      <h1>Subscribe to {teacher.name}</h1>
      <p className="muted">
        {teacher.subject} · {teacher.gradeClass}
      </p>
      <div className="card-media img-zoom rounded">
        <TeacherImage teacher={teacher} />
      </div>

      {data.hasActiveSubscription ? (
        <div className="alert alert-success" role="status">
          You already have an active subscription with this teacher
          {data.activeSubscription ? ` until ${new Date(data.activeSubscription.endDate).toLocaleDateString()}` : ""}.
          <div className="btn-row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate(`/content/teacher/${teacherId}`)}>
              Go to content
            </button>
          </div>
        </div>
      ) : done ? (
        <div className="alert alert-success" role="status">
          {done.message || "Payment confirmed. Subscription activated."}
          <div className="btn-row" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => navigate(`/content/teacher/${teacher.id || teacherId}`)}>
              Go to content
            </button>
          </div>
        </div>
      ) : (
        <>
          <h2>Choose a plan</h2>
          <div className="plan-list">
            {plans.map((plan) => (
              <label key={plan.duration} className={duration === plan.duration ? "plan plan-selected" : "plan"}>
                <input
                  type="radio"
                  name="duration"
                  value={plan.duration}
                  checked={duration === plan.duration}
                  onChange={() => setDuration(plan.duration)}
                />
                <span className="plan-label">{plan.label}</span>
                <span className="plan-price">{String(plan.price)}</span>
              </label>
            ))}
          </div>
          {confirmError ? <ErrorBox error={confirmError} /> : null}
          {userType && userType !== "student" ? (
            <div className="alert alert-error" role="alert">
              Only students can subscribe to teachers. Please log in with a student account.
            </div>
          ) : (
            <button type="button" className="btn btn-dark btn-block" disabled={confirming} onClick={handleConfirm}>
              {confirming ? "Confirming..." : "Confirm payment"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
