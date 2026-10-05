export function formatPrice(value) {
  const n = typeof value === "string" ? Number(value) : Number(value);
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function formatDate(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

export function formatDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
