import { useEffect, useState } from "react";
import { endpoints, toApiError } from "../api/client.js";
import { ErrorBox, Loader } from "../components/ui.jsx";

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

  const incomeText = (() => {
    if (!data) return "0.00";
    const n = Number(data.totalIncome);
    if (!Number.isFinite(n)) return "0.00";
    return n.toFixed(2);
  })();

  return (
    <div className="page">
      <h1>Platform income</h1>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            <tr><td>Total income (sum of subscription prices)</td><td>{incomeText}</td></tr>
            <tr><td>Total payments (subscription records)</td><td>{data.totalPayments}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
