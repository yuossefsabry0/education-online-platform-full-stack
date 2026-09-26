const { error } = require("../utils/apiResponse");
const { loadActiveRoles } = require("./auth");

function resolveTeacherFromSubscription(sub) {
  // A subscription is considered covering a teacher when the requested role
  // equals the teacher's derived role (SUB{teacherId}) OR the subscription's
  // stored teacherRole matches the requested role.
  const teacherRole = sub.teacherRole;
  const teacherIdFromRole =
    typeof teacherRole === "string" && teacherRole.startsWith("SUB")
      ? parseInt(teacherRole.slice(3), 10)
      : null;

  return { teacherRole, teacherIdFromRole };
}

async function requireSubAccess(req, res, next) {
  if (!req.user) {
    return error(res, "Authentication required", 401, "UNAUTHORIZED");
  }

  if (req.user.userType !== "student") {
    return error(
      res,
      "Only students can hold subscriptions",
      403,
      "FORBIDDEN"
    );
  }

  const activeRoles = await loadActiveRoles(req.user);
  if (!activeRoles.length) {
    return error(
      res,
      "Access denied: no active subscription",
      403,
      "NO_ACTIVE_SUBSCRIPTION"
    );
  }

  req.activeRoles = activeRoles;

  const roleRequired = req.roleRequired || null;
  if (roleRequired) {
    if (!activeRoles.includes(roleRequired)) {
      return error(
        res,
        "Access denied: active subscription required for this content",
        403,
        "SUBSCRIPTION_REQUIRED"
      );
    }
  }

  next();
}

module.exports = {
  requireSubAccess,
  requireCoverage: (teacherRoleOrFn) => (req, res, next) => {
    req.roleRequired =
      typeof teacherRoleOrFn === "function"
        ? teacherRoleOrFn(req)
        : teacherRoleOrFn;
    return requireSubAccess(req, res, next);
  },
  resolveTeacherFromSubscription,
};
