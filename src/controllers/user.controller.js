const prisma = require("../db/prisma");
const { success } = require("../utils/apiResponse");
const { loadActiveRoles } = require("../middlewares/auth");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");

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

  let teachers = [];
  if (userType === "student") {
    const subscriptions = await prisma.subscription.findMany({
      where: {
        studentId: id,
        ...activeSubscriptionWhere(new Date()),
        teacher: { isActive: true },
      },
      select: {
        teacher: {
          select: { id: true, name: true, subject: true, gradeClass: true },
        },
      },
    });
    teachers = subscriptions.map((s) => s.teacher);
  }

  return success(res, {
    user: { userType, ...record },
    activeRoles,
    teachers,
  });
}

module.exports = { me };