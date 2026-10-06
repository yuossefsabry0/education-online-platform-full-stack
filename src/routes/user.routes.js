const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const userController = require("../controllers/user.controller");
const historyController = require("../controllers/history.controller");
const examController = require("../controllers/exam.controller");
const notificationController = require("../controllers/notification.controller");

const router = Router();

router.get("/me", requireAuth, userController.me);
router.get("/history", requireAuth, historyController.history);
// Student notification feed (login, subscriptions, payments, expiry, new lectures).
router.get("/notifications", requireAuth, notificationController.list);
// Overall exam performance across every exam the student has taken.
router.get("/exams/performance", requireAuth, examController.myPerformance);

module.exports = router;