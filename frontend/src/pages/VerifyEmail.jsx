import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(null);

  async function confirm(value) {
    setStatus("working");
    setMessage(null);
    try {
      const data = await endpoints.confirmVerification({ token: value });
      setMessage(data.message || "Email verified.");
      setStatus("done");
    } catch (err) {
      setMessage(toApiError(err).message);
      setStatus("error");
    }
  }

  useEffect(() => {
    const initial = params.get("token") || "";
    if (initial) confirm(initial);
  }, []);

  async function resend(e) {
    e.preventDefault();
    setStatus("working");
    setMessage(null);
    try {
      const data = await endpoints.resendVerification({ email });
      setMessage(data.message || "If an account exists for this email, a verification token has been sent.");
      setStatus("done");
    } catch (err) {
      setMessage(toApiError(err).message);
      setStatus("error");
    }
  }

  return (
    <div className="page page-narrow">
      <div className="form-card">
        <h1>Verify email</h1>
        {status === "working" ? <p className="muted">Working...</p> : null}
        {status === "done" ? <div className="alert alert-success" role="status">{message}</div> : null}
        {status === "error" ? <div className="alert alert-error" role="alert">{message}</div> : null}
        {status === "idle" || status === "error" ? (
          <form onSubmit={(e) => { e.preventDefault(); confirm(token); }}>
            <label className="field">
              <span>Verification token</span>
              <input type="text" value={token} onChange={(e) => setToken(e.target.value)} required />
            </label>
            <button type="submit" className="btn btn-dark btn-block">Verify email</button>
          </form>
        ) : null}
        <h2>Need a new token?</h2>
        <form onSubmit={resend}>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <button type="submit" className="btn btn-ghost btn-block">Resend verification token</button>
        </form>
        <p className="muted center">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
