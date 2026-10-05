const { Router } = require("express");
const { requireAdmin } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const adminController = require("../controllers/admin.controller");
const {
  addTeacherSchema,
  editTeacherSchema,
} = require("../validations/admin.schema");
const {
  addContentSchema,
  editContentSchema,
} = require("../validations/content.schema");
const uploadController = require("../controllers/upload.controller");
const { uploadLimiter } = require("../middlewares/rateLimiter");

const router = Router();

// All admin routes are exclusive to the admin role.
router.use(requireAdmin);

// All Subscribers (pagination + sorting)
router.get("/subscribers", adminController.listSubscribers);

// Subscribers per teacher
router.get(
  "/teachers/:teacherId/subscribers",
  adminController.listTeacherSubscribers
);

// Total Platform Income
router.get("/income", adminController.getTotalIncome);

// Individual Teacher Detail (full access for admin)
router.get("/teachers/:teacherId", adminController.getTeacherDetail);

// Edit teacher (profile data + subscription durations/prices)
router.put(
  "/teachers/:teacherId",
  validate(editTeacherSchema),
  adminController.editTeacher
);

// Manage a teacher's content (Lectures / Lesson Content / Homework)
router.post(
  "/teachers/:teacherId/content",
  validate(addContentSchema),
  adminController.addContent
);
router.put(
  "/teachers/:teacherId/content/:contentId",
  validate(editContentSchema),
  adminController.editContent
);
router.delete(
  "/teachers/:teacherId/content/:contentId",
  adminController.deleteContent
);
router.post(
  "/teachers/:teacherId/content/upload",
  uploadLimiter,
  uploadController.uploadSingle,
  uploadController.uploadTeacherFileAsAdmin
);

// Add Teacher (no manual code/schema change needed to enable their role routes)
router.post("/teachers", validate(addTeacherSchema), adminController.addTeacher);

// Delete Teacher (soft-delete; blocked while the teacher has active subscribers)
router.delete("/teachers/:teacherId", adminController.deleteTeacher);

// Log History (chronological, pagination + sorting)
router.get("/logs", adminController.getLogHistory);

// Cancel a user's active subscription with a teacher
router.post(
  "/subscriptions/:subscriptionId/cancel",
  adminController.cancelSubscription
);

module.exports = router;