import { useState } from "react";
import { Link } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [userType, setUserType] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body = userType ? { email, userType } : { email };
      const data = await endpoints.requestPasswordReset(body);
      setDone(data.message || "If an account exists for this email, a reset token has been sent.");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="form-card">
        <h1>Forgot password</h1>
        <p className="muted">Enter your account email to receive a reset token.</p>
        {done ? (
          <div className="alert alert-success" role="status">
            {done}
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <Link className="btn btn-dark btn-sm" to="/reset-password">Continue to reset</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error ? <div className="alert alert-error" role="alert">{error.message}</div> : null}
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            <label className="field">
              <span>Account type (optional, helps when one email is shared)</span>
              <select value={userType} onChange={(e) => setUserType(e.target.value)}>
                <option value="">Auto-detect</option>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <button type="submit" className="btn btn-dark btn-block" disabled={loading}>
              {loading ? "Sending..." : "Send reset token"}
            </button>
          </form>
        )}
        <p className="muted center">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
