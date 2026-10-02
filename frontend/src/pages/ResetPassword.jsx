import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { FieldError } from "../components/ui.jsx";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await endpoints.confirmPasswordReset({ token, newPassword });
      setDone(data.message || "Password reset. Please log in again.");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="form-card">
        <h1>Reset password</h1>
        <p className="muted">Paste your reset token and choose a new password.</p>
        {done ? (
          <div className="alert alert-success" role="status">
            {done}
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <Link className="btn btn-dark btn-sm" to="/login">Go to login</Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error ? (
              <div className="alert alert-error" role="alert">
                {error.message}
                <FieldError details={error.details} field="token" />
                <FieldError details={error.details} field="newPassword" />
              </div>
            ) : null}
            <label className="field">
              <span>Reset token</span>
              <input type="text" value={token} onChange={(e) => setToken(e.target.value)} required />
            </label>
            <label className="field">
              <span>New password</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
            </label>
            <button type="submit" className="btn btn-dark btn-block" disabled={loading}>
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
