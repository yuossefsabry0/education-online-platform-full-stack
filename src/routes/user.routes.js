const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const userController = require("../controllers/user.controller");
const historyController = require("../controllers/history.controller");

const router = Router();

router.get("/me", requireAuth, userController.me);
router.get("/history", requireAuth, historyController.history);

module.exports = router;