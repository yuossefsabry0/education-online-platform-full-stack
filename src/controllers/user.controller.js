const prisma = require("../db/prisma");
const { success } = require("../utils/apiResponse");
const { loadActiveRoles } = require("../middlewares/auth");

const USER_LOOKUP = {
  student: { table: prisma.student, label: "student" },
  teacher: { table: prisma.teacher, label: "teacher" },
  admin: { table: prisma.admin, label: "admin" },
};

async function me(req, res) {
  const { userType, id } = req.user;
  const cfg = USER_LOOKUP[userType];
  if (!cfg) return success(res, { user: null });

  const record = await cfg.table.findUnique({
    where: { id },
    select: { id: true, username: true },
  });

  const activeRoles = await loadActiveRoles(req.user);

  return success(res, {
    user: { userType, ...record },
    activeRoles,
  });
}

module.exports = { me };