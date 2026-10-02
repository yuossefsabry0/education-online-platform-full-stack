const {
  isSubscriptionActive,
  activeSubscriptionWhere,
} = require("../../src/utils/subscriptionStatus");

function sub(status, endDate) {
  return { status, endDate };
}

describe("centralized subscription status rule", () => {
  it("treats a future ACTIVE subscription as active", () => {
    const future = new Date(Date.now() + 86400000);
    expect(isSubscriptionActive(sub("ACTIVE", future))).toBe(true);
  });

  it("treats expired, cancelled and past-end subscriptions as inactive", () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);
    expect(isSubscriptionActive(sub("EXPIRED", future))).toBe(false);
    expect(isSubscriptionActive(sub("CANCELLED", future))).toBe(false);
    expect(isSubscriptionActive(sub("ACTIVE", past))).toBe(false);
    expect(isSubscriptionActive(sub("ACTIVE", new Date(Date.now() - 1000)))).toBe(false);
  });

  it("builds a prisma where clause matching the same rule", () => {
    const now = new Date();
    const where = activeSubscriptionWhere(now);
    expect(where.status).toEqual({ notIn: ["EXPIRED", "CANCELLED"] });
    expect(where.endDate).toEqual({ gt: now });
  });
});
