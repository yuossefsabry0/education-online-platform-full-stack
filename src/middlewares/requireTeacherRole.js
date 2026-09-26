const { error } = require("../utils/apiResponse");

function requireTeacherRole(req, res, next) {
  if (!req.user) {
    return error(res, "Authentication required", 401, "UNAUTHORIZED");
  }
  if (req.user.userType !== "teacher") {
    return error(res, "Teacher access required", 403, "FORBIDDEN");
  }
  next();
}

module.exports = { requireTeacherRole };
