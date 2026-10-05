const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireCoverage } = require("../middlewares/subscriptionAccess");
const validate = require("../middlewares/validate");
const { submitExamSchema } = require("../validations/exam.schema");
const contentController = require("../controllers/content.controller");
const examController = require("../controllers/exam.controller");
const lectureJourneyController = require("../controllers/lectureJourney.controller");
const { deriveTeacherRole } = require("../utils/teacherRole");

const router = Router();

const requireTeacherSubscription = requireCoverage(
  (req) => deriveTeacherRole(req.params.teacherId)
);

// Protected content page for a teacher: visible only to holders of the
// teacher's active subscription role (SUB{teacherId}).
router.get(
  "/teacher/:teacherId",
  requireAuth,
  requireTeacherSubscription,
  contentController.showContentPage
);

// Exams live inside the assignment workflow: students with an active
// subscription list published exams, take them, and submit answers.
// NOTE: these must stay above the generic "/:section" route below, otherwise
// Express matches "exams" as a section name and returns SECTION_NOT_FOUND.
router.get(
  "/teacher/:teacherId/exams",
  requireAuth,
  requireTeacherSubscription,
  examController.listStudentExams
);

router.get(
  "/teacher/:teacherId/exams/:examId",
  requireAuth,
  requireTeacherSubscription,
  examController.getStudentExam
);

router.post(
  "/teacher/:teacherId/exams/:examId/submit",
  requireAuth,
  requireTeacherSubscription,
  validate(submitExamSchema),
  examController.submitExam
);

// Sequential tiered Lecture Journey (additive): lecture entry -> exam (>=50%)
// -> material files -> video (watch tracked). Same subscription gate, placed
// above the generic "/:section" route so "lectures" is not treated as section.
router.get(
  "/teacher/:teacherId/lectures/:lectureId/journey",
  requireAuth,
  requireTeacherSubscription,
  lectureJourneyController.getLectureJourney
);

router.post(
  "/teacher/:teacherId/lectures/:lectureId/watch",
  requireAuth,
  requireTeacherSubscription,
  lectureJourneyController.recordLectureWatch
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