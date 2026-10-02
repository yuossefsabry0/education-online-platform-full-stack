const { Router } = require("express");
const { requireAuth } = require("../middlewares/auth");
const uploadController = require("../controllers/upload.controller");

const router = Router();

router.get("/files/:name", requireAuth, uploadController.downloadFile);

module.exports = router;
