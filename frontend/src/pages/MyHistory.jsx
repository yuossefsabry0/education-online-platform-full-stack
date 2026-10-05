import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { EmptyState, ErrorBox, Loader, Pagination } from "../components/ui.jsx";

export default function MyHistory() {
  const [subData, setSubData] = useState(null);
  const [eventData, setEventData] = useState(null);
  const [subPage, setSubPage] = useState(1);
  const [eventPage, setEventPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (subPage === eventPage) {
          const result = await endpoints.history({ page: subPage, limit: 10 });
          if (!cancelled) {
            setSubData(result.subscriptions || { items: [], pagination: null });
            setEventData(result.events || { items: [], pagination: null });
          }
        } else {
          const [s, e] = await Promise.all([
            endpoints.history({ page: subPage, limit: 10 }),
            endpoints.history({ page: eventPage, limit: 10 }),
          ]);
          if (!cancelled) {
            setSubData(s.subscriptions || { items: [], pagination: null });
            setEventData(e.events || { items: [], pagination: null });
          }
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
  }, [subPage, eventPage, attempt]);

  if (loading) return <div className="page"><Loader label="Loading your history..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>My History</h1>
        <ErrorBox error={error} onRetry={() => setAttempt((n) => n + 1)} />
      </div>
    );
  }

  const subs = subData || { items: [], pagination: null };
  const events = eventData || { items: [], pagination: null };

  return (
    <div className="page">
      <h1>My History</h1>
      <h2>Subscriptions</h2>
      {subs.items.length === 0 ? (
        <EmptyState title="No subscription records" hint="Your subscription activity will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="muted small">Subscription records</caption>
            <thead><tr><th scope="col">Teacher</th><th scope="col">Duration</th><th scope="col">Status</th><th scope="col">Since</th></tr></thead>
            <tbody>
              {subs.items.map((s) => (
                <tr key={s.id}>
                  <td>{s.teacher ? s.teacher.name : s.teacherRole}</td>
                  <td>{s.duration}</td>
                  <td>{s.status}</td>
                  <td>{s.startDate ? new Date(s.startDate).toLocaleDateString() : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {subs.pagination && subs.pagination.totalPages > 1 ? (
        <Pagination page={subs.pagination.page} totalPages={subs.pagination.totalPages} onChange={setSubPage} />
      ) : null}
      <h2>Activity</h2>
      {events.items.length === 0 ? (
        <EmptyState title="No activity yet" hint="Subscription events will appear here." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="muted small">Activity events</caption>
            <thead><tr><th scope="col">Event</th><th scope="col">Date</th></tr></thead>
            <tbody>
              {events.items.map((e) => (
                <tr key={e.id}>
                  <td>{e.actionType}</td>
                  <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {events.pagination && events.pagination.totalPages > 1 ? (
        <Pagination page={events.pagination.page} totalPages={events.pagination.totalPages} onChange={setEventPage} />
      ) : null}
    </div>
  );
}
