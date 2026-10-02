import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// GET /api/user/me -> { user: { userType, id, username }, activeRoles, teachers }
export default function Profile() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeError, setChangeError] = useState(null);
  const [changeDone, setChangeDone] = useState(null);

  async function handleChangePassword(e) {
    e.preventDefault();
    setChangeError(null);
    setChangeDone(null);
    setChanging(true);
    try {
      const result = await endpoints.changePassword({ currentPassword, newPassword });
      setChangeDone(result.message || "Password changed. Please log in again.");
      setCurrentPassword("");
      setNewPassword("");
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setChangeError(toApiError(err));
    } finally {
      setChanging(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await endpoints.me();
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
  }, []);

  if (loading) return <div className="page"><Loader label="Loading profile..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Profile</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const roles = data.activeRoles || [];
  const teachers = data.teachers || [];
  const nameByRole = {};
  for (const t of teachers) {
    if (t && t.id !== undefined) nameByRole[`SUB${t.id}`] = t.name;
  }
  return (
    <div className="page page-narrow">
      <h1>Profile</h1>
      <div className="form-card">
        <p><strong>Username:</strong> {data.user?.username}</p>
        <p><strong>Account type:</strong> {data.user?.userType}</p>
        <p><strong>User ID:</strong> {data.user?.id}</p>
        <h2>Active subscriptions</h2>
        {roles.length === 0 ? (
          <EmptyState title="No active subscriptions" hint="Subscribe to a teacher to unlock their content." />
        ) : (
          <ul className="role-list">
            {roles.map((role) => (
              <li key={role}>
                <span className="role-badge">{nameByRole[role] || role}</span>
              </li>
            ))}
          </ul>
        )}
        <h2>Change password</h2>
        {changeDone ? <div className="alert alert-success" role="status">{changeDone}</div> : null}
        {changeError ? <div className="alert alert-error" role="alert">{changeError.message}</div> : null}
        <form onSubmit={handleChangePassword}>
          <label className="field">
            <span>Current password</span>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>New password</span>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" required />
          </label>
          <button type="submit" className="btn btn-dark" disabled={changing}>
            {changing ? "Changing..." : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
