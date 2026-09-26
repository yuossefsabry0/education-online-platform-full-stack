const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireCoverage } = require("../middlewares/subscriptionAccess");
const contentController = require("../controllers/content.controller");

const router = Router();

const requireTeacherSubscription = requireCoverage(
  (req) => `SUB${req.params.teacherId}`
);

// Protected content page for a teacher: visible only to holders of the
// teacher's active subscription role (SUB{teacherId}).
router.get(
  "/teacher/:teacherId",
  requireAuth,
  requireTeacherSubscription,
  contentController.showContentPage
);

// Lectures / Lesson Content / Homework routes for one teacher, gated by the
// same active subscription role as the content page above.
router.get(
  "/teacher/:teacherId/:section",
  requireAuth,
  requireTeacherSubscription,
  contentController.showSection
);

module.exports = router;