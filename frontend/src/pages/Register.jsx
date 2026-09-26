import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import { FieldError } from "../components/ui.jsx";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    // POST /api/auth/register { name, username, email, password } (students only)
    const result = await register(form);
    setLoading(false);
    if (result.ok) {
      navigate("/login", { replace: true });
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="page page-narrow">
      <div className="form-card">
        <h1>Create student account</h1>
        <p className="muted">Registration is open for students. Teachers and admins are created by the administration.</p>
        {error ? (
          <div className="alert alert-error" role="alert">
            {error.message}
            {["name", "username", "email", "password"].map((f) => (
              <FieldError key={f} details={error.details} field={f} />
            ))}
          </div>
        ) : null}
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Full name</span>
            <input type="text" value={form.name} onChange={(e) => update("name", e.target.value)} required />
          </label>
          <label className="field">
            <span>Username</span>
            <input type="text" value={form.username} onChange={(e) => update("username", e.target.value)} required />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </label>
          <label className="field">
            <span>Password (min 6 characters)</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>
          <button type="submit" className="btn btn-dark btn-block" disabled={loading}>
            {loading ? "Creating account..." : "Register"}
          </button>
        </form>
        <p className="muted center">
          Already have an account? <Link to="/login">Login</Link>
        </p>
      </div>
    </div>
  );
}
