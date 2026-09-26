const { Router } = require("express");
const validate = require("../middlewares/validate");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} = require("../validations/auth.schema");
const authController = require("../controllers/auth.controller");
const { authLimiter, tokenLimiter } = require("../middlewares/rateLimiter");

const router = Router();

// Strict rate limits on authentication endpoints to slow down brute-force,
// credential-stuffing, and token-abuse attempts.
router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", tokenLimiter, validate(refreshTokenSchema), authController.refresh);
router.post("/logout", tokenLimiter, validate(refreshTokenSchema), authController.logout);

module.exports = router;