function isSubscriptionActive(sub, now) {
  const at = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
  if (!sub) return false;
  if (sub.status === "EXPIRED" || sub.status === "CANCELLED") return false;
  if (!sub.endDate) return false;
  return new Date(sub.endDate) > at;
}

function activeSubscriptionWhere(now) {
  const at = now instanceof Date ? now : new Date(now === undefined ? Date.now() : now);
  return {
    status: { notIn: ["EXPIRED", "CANCELLED"] },
    endDate: { gt: at },
  };
}

module.exports = { isSubscriptionActive, activeSubscriptionWhere };
