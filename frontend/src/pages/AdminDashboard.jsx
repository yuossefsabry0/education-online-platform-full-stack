import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox, Loader } from "../components/ui.jsx";
import { formatPrice } from "../utils/format.js";

// /admin/dashboard — navigation hub + live summary, all from real endpoints:
// GET /api/admin/income, GET /api/admin/subscribers?limit=1 (total), GET /api/admin/logs?limit=1 (total).
// The analytics panels below reuse the same endpoints (recent log entries).
const NAV_ITEMS = [
  { to: "/admin/subscribers", title: "All Subscribers", desc: "Every subscription with student and teacher info." },
  { to: "/admin/teachers", title: "Teachers", desc: "Browse, add, edit, and manage teachers and their content." },
  { to: "/admin/income", title: "Platform Income", desc: "Total income and payment count." },
  { to: "/admin/logs", title: "Log History", desc: "Chronological audit log of platform actions." },
];

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.max(Math.floor((Date.now() - then) / 1000), 0);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const KPI_ICONS = {
  income: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  payments: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  ),
  subscriptions: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  logs: (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <line x1="8" x2="21" y1="6" y2="6" />
      <line x1="8" x2="21" y1="12" y2="12" />
      <line x1="8" x2="21" y1="18" y2="18" />
      <line x1="3" x2="3.01" y1="6" y2="6" />
      <line x1="3" x2="3.01" y1="12" y2="12" />
      <line x1="3" x2="3.01" y1="18" y2="18" />
    </svg>
  ),
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bTitle, setBTitle] = useState("");
  const [bMsg, setBMsg] = useState("");
  const [bSending, setBSending] = useState(false);
  const [bOk, setBOk] = useState(null);
  const [bErr, setBErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [income, subs, logs, recent] = await Promise.all([
          endpoints.adminIncome(),
          endpoints.adminSubscribers({ page: 1, limit: 1 }),
          endpoints.adminLogs({ page: 1, limit: 1 }),
          endpoints.adminLogs({ page: 1, limit: 30 }),
        ]);
        if (!cancelled) {
          setSummary({
            totalIncome: income.totalIncome,
            totalPayments: income.totalPayments,
            totalSubscribers: subs.pagination ? subs.pagination.total : 0,
            totalLogs: logs.pagination ? logs.pagination.total : 0,
          });
          setRecentLogs(recent.logs || []);
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

  const actionFreq = (() => {
    const counts = {};
    for (const log of recentLogs) {
      if (log && log.actionType) counts[log.actionType] = (counts[log.actionType] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  })();
  const maxFreq = actionFreq.length > 0 ? actionFreq[0][1] : 0;

  async function handleBroadcast(e) {
    e.preventDefault();
    if (bSending) return;
    setBOk(null);
    setBErr(null);
    setBSending(true);
    try {
      await endpoints.adminBroadcast({ title: bTitle.trim(), message: bMsg.trim() });
      setBOk("Notification sent to all accounts.");
      setBTitle("");
      setBMsg("");
    } catch (err) {
      setBErr(toApiError(err).message);
    } finally {
      setBSending(false);
    }
  }

  return (
    <div className="page">
      <h1>Admin dashboard</h1>
      <p className="muted">Manage teachers, subscribers, income, and platform activity.</p>

      {loading ? (
        <Loader label="Loading summary..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      ) : summary ? (
        <>
          <section aria-label="Overview">
            <div className="admin-kpi-grid">
              <button type="button" className="admin-kpi" onClick={() => navigate("/admin/income")}>
                <span className="admin-kpi-icon" aria-hidden="true">{KPI_ICONS.income}</span>
                <span className="admin-kpi-text">
                  <span className="admin-kpi-label">Total income</span>
                  <strong className="admin-kpi-value">{formatPrice(summary.totalIncome ?? 0)}</strong>
                </span>
              </button>
              <button type="button" className="admin-kpi" onClick={() => navigate("/admin/income")}>
                <span className="admin-kpi-icon" aria-hidden="true">{KPI_ICONS.payments}</span>
                <span className="admin-kpi-text">
                  <span className="admin-kpi-label">Total payments</span>
                  <strong className="admin-kpi-value">{summary.totalPayments}</strong>
                </span>
              </button>
              <button type="button" className="admin-kpi" onClick={() => navigate("/admin/subscribers")}>
                <span className="admin-kpi-icon" aria-hidden="true">{KPI_ICONS.subscriptions}</span>
                <span className="admin-kpi-text">
                  <span className="admin-kpi-label">Subscriptions</span>
                  <strong className="admin-kpi-value">{summary.totalSubscribers}</strong>
                </span>
              </button>
              <button type="button" className="admin-kpi" onClick={() => navigate("/admin/logs")}>
                <span className="admin-kpi-icon" aria-hidden="true">{KPI_ICONS.logs}</span>
                <span className="admin-kpi-text">
                  <span className="admin-kpi-label">Log entries</span>
                  <strong className="admin-kpi-value">{summary.totalLogs}</strong>
                </span>
              </button>
            </div>
          </section>

          <div className="admin-panels">
            <section className="admin-panel" aria-label="Activity by action">
              <h2>Activity by action</h2>
              {actionFreq.length === 0 ? (
                <p className="muted small">No activity recorded yet.</p>
              ) : (
                <div className="admin-bars">
                  {actionFreq.map(([action, count]) => (
                    <div key={action} className="admin-bar-row" title={`${action}: ${count}`}>
                      <span className="admin-bar-label">{action}</span>
                      <span className="admin-bar-track">
                        <span
                          className="admin-bar-fill"
                          style={{ width: maxFreq > 0 ? `${Math.round((count / maxFreq) * 100)}%` : "0%" }}
                        />
                      </span>
                      <span className="admin-bar-count">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="admin-panel" aria-label="Recent activity">
              <h2>Recent activity</h2>
              {recentLogs.length === 0 ? (
                <p className="muted small">No recent entries.</p>
              ) : (
                <ul className="admin-activity-list">
                  {recentLogs.slice(0, 6).map((log) => (
                    <li key={log.id}>
                      <button type="button" className="admin-activity-item" onClick={() => navigate("/admin/logs")}>
                        <span className="admin-activity-dot" aria-hidden="true" />
                        <span className="admin-activity-text">
                          <strong>{log.actionType}</strong>
                          <span className="muted small">{log.actorType || ""}</span>
                        </span>
                        <span className="muted small">{timeAgo(log.timestamp)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : null}

      <h2>Send notification</h2>
      <form className="form-card" onSubmit={handleBroadcast}>
        <p className="muted small" style={{ marginTop: 0 }}>
          Broadcast a notification to every account registered on the platform.
        </p>
        {bOk ? <div className="alert alert-success" role="status">{bOk}</div> : null}
        {bErr ? <div className="alert alert-error" role="alert">{bErr}</div> : null}
        <label className="field"><span>Title</span>
          <input
            type="text"
            value={bTitle}
            maxLength={100}
            onChange={(e) => setBTitle(e.target.value)}
            placeholder="e.g. Maintenance tonight"
            required
          />
        </label>
        <label className="field"><span>Message</span>
          <textarea
            rows={3}
            value={bMsg}
            maxLength={500}
            onChange={(e) => setBMsg(e.target.value)}
            placeholder="Details shown when the notification is opened..."
            required
          />
        </label>
        <button type="submit" className="btn btn-dark" disabled={bSending || bTitle.trim() === "" || bMsg.trim() === ""}>
          {bSending ? "Sending..." : "Send to all accounts"}
        </button>
      </form>

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
