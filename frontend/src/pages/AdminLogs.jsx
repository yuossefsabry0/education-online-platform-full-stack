import { useCallback, useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

// GET /api/admin/logs?page&limit&sortBy&sortOrder&actionType&actorType
// actorType: STUDENT | TEACHER | ADMIN | SYSTEM
export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState("");
  const [actorType, setActorType] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await endpoints.adminLogs({
        page,
        limit: 15,
        actionType: actionType || undefined,
        actorType: actorType || undefined,
      });
      setLogs(data.logs || []);
      setPagination(data.pagination || null);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, actionType, actorType]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="page">
      <h1>Log history</h1>
      <form
        className="search-bar"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          fetchLogs();
        }}
      >
        <input
          type="text"
          placeholder="Filter by action type (e.g. TEACHER_CREATED)"
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          aria-label="Filter by action type"
        />
        <select value={actorType} onChange={(e) => { setActorType(e.target.value); setPage(1); }} aria-label="Filter by actor type">
          <option value="">All actors</option>
          <option value="STUDENT">STUDENT</option>
          <option value="TEACHER">TEACHER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="SYSTEM">SYSTEM</option>
        </select>
        <button type="submit" className="btn btn-dark">Filter</button>
      </form>

      {loading ? (
        <Loader label="Loading logs..." />
      ) : error ? (
        <ErrorBox error={error} onRetry={fetchLogs} />
      ) : logs.length === 0 ? (
        <EmptyState title="No log entries" hint="No actions have been recorded yet." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>ID</th><th>Action</th><th>Actor</th><th>Target</th><th>Timestamp</th><th>Details</th></tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{log.id}</td>
                    <td>{log.actionType}</td>
                    <td>{log.actorType}{log.actorId ? ` #${log.actorId}` : ""}</td>
                    <td>{log.targetId || "—"}</td>
                    <td>{new Date(log.timestamp).toLocaleString()}</td>
                    <td className="details-cell">{log.details ? JSON.stringify(log.details) : "—"}</td>
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
