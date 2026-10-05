import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox, Loader } from "../components/ui.jsx";
import { formatPrice } from "../utils/format.js";

// GET /api/admin/income -> { totalIncome, totalPayments }
export default function AdminIncome() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await endpoints.adminIncome();
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

  if (loading) return <div className="page"><Loader label="Loading income..." /></div>;
  if (error) {
    return (
      <div className="page">
        <h1>Platform income</h1>
        <ErrorBox error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const incomeText = formatPrice(data ? data.totalIncome : 0);

  return (
    <div className="page">
      <h1>Platform income</h1>
      <div className="table-wrap">
        <table className="data-table">
          <caption className="muted small">Platform income</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">Value</th></tr></thead>
          <tbody>
            <tr><td>Total income (paid subscriptions, cancelled excluded)</td><td>{incomeText}</td></tr>
            <tr><td>Total payments (subscription records)</td><td>{data.totalPayments}</td></tr>
            <tr><td>Cancelled payments (excluded from income)</td><td>{data.cancelledPayments ?? 0}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
