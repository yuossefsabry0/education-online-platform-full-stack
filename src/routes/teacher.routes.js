const { Router } = require("express");
const { optionalAuth, requireAuth } = require("../middlewares/auth");
const { requireCoverage } = require("../middlewares/subscriptionAccess");
const teacherController = require("../controllers/teacher.controller");
const { success } = require("../utils/apiResponse");
const { listPublishedIndex } = require("../services/teacherContent");
const { deriveTeacherRole } = require("../utils/teacherRole");

const router = Router();

router.get("/search", optionalAuth, teacherController.searchTeachers);
router.get("/", optionalAuth, teacherController.listTeachers);

router.get(
  "/:teacherId/content",
  requireAuth,
  requireCoverage((req) => deriveTeacherRole(req.params.teacherId)),
  async (req, res, next) => {
    try {
      const teacherId = parseInt(req.params.teacherId, 10);
      const content = await listPublishedIndex(teacherId);
      return success(res, { teacherId, content, activeRoles: req.activeRoles });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;