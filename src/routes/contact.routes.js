const { Router } = require("express");
const contactController = require("../controllers/contact.controller");

const router = Router();

router.get("/", contactController.contactUs);

module.exports = router;