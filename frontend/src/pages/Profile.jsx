import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader } from "../components/ui.jsx";

// GET /api/user/me -> { user: { userType, id, username }, activeRoles }
export default function Profile() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
                <span className="role-badge">{role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
