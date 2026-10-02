const prisma = require("../db/prisma");
const { error } = require("../utils/apiResponse");
const {
  verifyLoginToken,
  extractBearerToken,
} = require("../utils/token");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");

function attachUser(req) {
  const token = extractBearerToken(req);
  if (!token) return false;

  try {
    const payload = verifyLoginToken(token);
    if (!payload || !payload.userType || !payload.id) return false;
    req.user = { userType: payload.userType, id: payload.id };
    return true;
  } catch {
    return false;
  }
}

function requireAuth(req, res, next) {
  if (!attachUser(req)) {
    return error(res, "Authentication required", 401, "UNAUTHORIZED");
  }
  next();
}

function optionalAuth(req, res, next) {
  attachUser(req);
  next();
}

function requireAdmin(req, res, next) {
  if (!attachUser(req)) {
    return error(res, "Authentication required", 401, "UNAUTHORIZED");
  }
  if (req.user.userType !== "admin") {
    return error(res, "Admin access required", 403, "FORBIDDEN");
  }
  next();
}

async function loadActiveRoles(user) {
  if (!user) return [];
  if (user.userType !== "student") return [];

  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      studentId: user.id,
      ...activeSubscriptionWhere(now),
    },
    select: { teacherRole: true },
  });

  return subscriptions.map((s) => s.teacherRole);
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  loadActiveRoles,
};
