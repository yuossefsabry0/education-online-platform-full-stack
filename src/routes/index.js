const { Router } = require("express");
const { success, error } = require("../utils/apiResponse");
const prisma = require("../db/prisma");
const authRoutes = require("./auth.routes");
const teacherRoutes = require("./teacher.routes");
const contactRoutes = require("./contact.routes");
const userRoutes = require("./user.routes");
const subscriptionRoutes = require("./subscription.routes");
const contentRoutes = require("./content.routes");
const dashboardRoutes = require("./dashboard.routes");
const adminRoutes = require("./admin.routes");
const filesRoutes = require("./files.routes");

const router = Router();

router.get("/health", (req, res) => {
  return success(res, { status: "ok", timestamp: new Date().toISOString() });
});

router.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return success(res, { status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    return error(res, "Database not ready", 503, "NOT_READY", err.message);
  }
});

router.use("/auth", authRoutes);
router.use("/contact", contactRoutes);
router.use("/teachers", teacherRoutes);
router.use("/user", userRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/content", contentRoutes);
router.use("/teacher", dashboardRoutes);
router.use("/admin", adminRoutes);
router.use("/", filesRoutes);

module.exports = router;