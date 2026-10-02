function toMoneyString(value) {
  if (value === null || value === undefined) return "0.00";
  const n = Number(String(value));
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

module.exports = { toMoneyString };
