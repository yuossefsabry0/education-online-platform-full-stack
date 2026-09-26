import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox, Loader } from "../components/ui.jsx";

// /admin/dashboard — navigation hub + live summary, all from real endpoints:
// GET /api/admin/income, GET /api/admin/subscribers?limit=1 (total), GET /api/admin/logs?limit=1 (total).
const NAV_ITEMS = [
  { to: "/admin/subscribers", title: "All Subscribers", desc: "Every subscription with student and teacher info." },
  { to: "/admin/teachers", title: "Teachers", desc: "Browse, add, edit, and manage teachers and their content." },
  { to: "/admin/income", title: "Platform Income", desc: "Total income and payment count." },
  { to: "/admin/logs", title: "Log History", desc: "Chronological audit log of platform actions." },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [income, subs, logs] = await Promise.all([
          endpoints.adminIncome(),
          endpoints.adminSubscribers({ page: 1, limit: 1 }),
          endpoints.adminLogs({ page: 1, limit: 1 }),
        ]);
        if (!cancelled) {
          setSummary({
            totalIncome: income.totalIncome,
            totalPayments: income.totalPayments,
            totalSubscribers: subs.pagination ? subs.pagination.total : 0,
            totalLogs: logs.pagination ? logs.pagination.total : 0,
          });
        }
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

  return (
    <div className="page">
      <h1>Admin dashboard</h1>
      <p className="muted">Manage teachers, subscribers, income, and platform activity.</p>

      {loading ? (
        <Loader label="Loading summary..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      ) : summary ? (
        <div className="stat-row">
          <div className="stat"><span>Total income</span><strong>{String(summary.totalIncome ?? 0)}</strong></div>
          <div className="stat"><span>Total payments</span><strong>{summary.totalPayments}</strong></div>
          <div className="stat"><span>Subscriptions</span><strong>{summary.totalSubscribers}</strong></div>
          <div className="stat"><span>Log entries</span><strong>{summary.totalLogs}</strong></div>
        </div>
      ) : null}

      <h2>Manage</h2>
      <div className="admin-nav-grid">
        {NAV_ITEMS.map((item) => (
          <button key={item.to} type="button" className="admin-nav-card" onClick={() => navigate(item.to)}>
            <strong>{item.title}</strong>
            <span className="muted">{item.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
