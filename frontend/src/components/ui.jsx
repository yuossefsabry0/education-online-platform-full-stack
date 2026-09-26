export function Loader({ label = "Loading..." }) {
  return (
    <div className="center-block">
      <div className="loader" role="status" aria-label={label} />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <strong>Something went wrong.</strong>
      <div>{error.message}</div>
      {error.details ? (
        <pre className="error-details">{JSON.stringify(error.details, null, 2)}</pre>
      ) : null}
      {onRetry ? (
        <button type="button" className="btn btn-dark btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      {hint ? <p className="muted">{hint}</p> : null}
      {action || null}
    </div>
  );
}

export function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (totalPages > 9 && Math.abs(p - page) > 2 && p !== 1 && p !== totalPages) continue;
    pages.push(p);
  }
  return (
    <div className="pagination">
      <button type="button" className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={p === page ? "btn btn-dark btn-sm" : "btn btn-ghost btn-sm"}
          onClick={() => onChange(p)}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

export function FieldError({ details, field }) {
  if (!Array.isArray(details)) return null;
  const messages = details.filter((d) => d.field === field).map((d) => d.message);
  if (!messages.length) return null;
  return <div className="field-error">{messages.join(" ")}</div>;
}
