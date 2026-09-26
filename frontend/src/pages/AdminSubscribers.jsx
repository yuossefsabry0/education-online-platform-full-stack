import { useCallback, useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

// GET /api/admin/subscribers?page&limit&sortBy&sortOrder&status
// Cancel: POST /api/admin/subscriptions/:subscriptionId/cancel
const SORT_OPTIONS = ["startDate", "createdAt", "price", "status", "studentName", "teacherName"];

export default function AdminSubscribers() {
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [sortBy, setSortBy] = useState("startDate");
  const [sortOrder, setSortOrder] = useState("desc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMsg, setActionMsg] = useState(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.adminSubscribers({
        page,
        limit: 10,
        sortBy,
        sortOrder,
        status: status || undefined,
      });
      setRows(data.subscribers || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, status, sortBy, sortOrder]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function handleCancel(subscriptionId) {
    if (!window.confirm("Cancel this active subscription? Access is revoked immediately.")) return;
    setActionMsg(null);
    try {
      const result = await endpoints.adminCancelSubscription(subscriptionId);
      setActionMsg(result.message || "Subscription cancelled.");
      fetchRows();
    } catch (err) {
      setActionMsg(toApiError(err).message);
    }
  }

  return (
    <div className="page">
      <h1>All subscribers</h1>
      <div className="filter-bar">
        <label className="field inline">
          <span>Status</span>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="EXPIRED">EXPIRED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </label>
        <label className="field inline">
          <span>Sort by</span>
          <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
            {SORT_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Order</span>
          <select value={sortOrder} onChange={(e) => { setSortOrder(e.target.value); setPage(1); }}>
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
        </label>
      </div>

      {actionMsg ? <div className="alert alert-success" role="status">{actionMsg}</div> : null}
      {loading ? (
        <Loader label="Loading subscribers..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={fetchRows} />
      ) : rows.length === 0 ? (
        <EmptyState title="No subscribers" hint="No subscriptions match the current filter." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th><th>Student</th><th>Teacher</th><th>Role</th>
                  <th>Duration</th><th>Price</th><th>Status</th><th>Period</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.student ? `${s.student.name} (${s.student.username})` : "—"}</td>
                    <td>{s.teacher ? s.teacher.name : "—"}</td>
                    <td>{s.teacherRole}</td>
                    <td>{s.duration}</td>
                    <td>{String(s.price)}</td>
                    <td>{s.status}</td>
                    <td>{new Date(s.startDate).toLocaleDateString()} → {new Date(s.endDate).toLocaleDateString()}</td>
                    <td>
                      {s.status === "ACTIVE" ? (
                        <button type="button" className="btn btn-dark btn-sm" onClick={() => handleCancel(s.id)}>
                          Cancel
                        </button>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={pagination?.page || page} totalPages={pagination?.totalPages || 0} onChange={setPage} />
        </>
      )}
    </div>
  );
}
