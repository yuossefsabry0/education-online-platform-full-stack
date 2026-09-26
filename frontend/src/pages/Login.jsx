import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { FieldError } from "../components/ui.jsx";

function destinationFor(userType, fallback) {
  if (userType === "admin") return "/admin/dashboard";
  if (userType === "teacher") return "/teacher/dashboard";
  return fallback && fallback.startsWith("/") ? fallback : "/home";
}

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  // Shown only when the backend reports the username exists in more than one
  // account table (409 AMBIGUOUS_USERNAME); otherwise login needs no type.
  const [needType, setNeedType] = useState(false);
  const [userType, setUserType] = useState("student");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // POST /api/auth/login { username, password } (+ userType only when the
    // username is shared by several account types).
    const result = await login(needType ? { ...form, userType } : form);
    setLoading(false);
    if (result.ok) {
      const from = location.state && location.state.from ? location.state.from : null;
      navigate(destinationFor(result.user.userType, from), { replace: true });
    } else {
      if (result.error && result.error.code === "AMBIGUOUS_USERNAME") {
        setNeedType(true);
      }
      setError(result.error);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="form-card">
        <h1>Login</h1>
        <p className="muted">Sign in with your education system account.</p>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error.message}
            <FieldError details={error.details} field="username" />
            <FieldError details={error.details} field="password" />
            <FieldError details={error.details} field="userType" />
          </div>
        ) : null}
        <form onSubmit={handleSubmit}>
          {needType ? (
            <label className="field">
              <span>Account type (several accounts share this username)</span>
              <select value={userType} onChange={(e) => setUserType(e.target.value)} required>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-dark btn-block" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
        <p className="muted center">
          New student? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
