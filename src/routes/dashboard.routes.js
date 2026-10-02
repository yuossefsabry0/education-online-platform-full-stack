const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const { requireTeacherRole } = require("../middlewares/requireTeacherRole");
const validate = require("../middlewares/validate");
const {
  addContentSchema,
  editContentSchema,
} = require("../validations/content.schema");
const contentController = require("../controllers/content.controller");
const uploadController = require("../controllers/upload.controller");

const router = Router();

// All teacher role routes require a logged-in user holding the Teacher role.
router.use(requireAuth, requireTeacherRole);

// Own route/dashboard: shows the teacher's own content/route (their own
// lectures, lesson content, homework) to their own subscribers.
router.get("/dashboard", contentController.showTeacherDashboard);

// Subscribers page: users subscribed with this specific teacher.
router.get("/dashboard/subscribers", contentController.viewSubscribers);

// Income for current month, last 3 months, and year.
router.get("/dashboard/income", contentController.getIncome);

// Add content into the teacher's own content/route.
router.post(
  "/dashboard/content",
  validate(addContentSchema),
  contentController.addContent
);

// Edit the teacher's own content (ownership enforced).
router.put(
  "/dashboard/content/:contentId",
  validate(editContentSchema),
  contentController.editContent
);

// Delete the teacher's own content (ownership enforced).
router.delete(
  "/dashboard/content/:contentId",
  contentController.deleteContent
);

// Upload a file for the teacher's own content (returns a fileUrl).
router.post(
  "/dashboard/content/upload",
  uploadController.uploadSingle,
  uploadController.uploadTeacherFile
);

module.exports = router;
