const { Router } = require("express");
const validate = require("../middlewares/validate");
const { requireAuth } = require("../middlewares/auth");
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  resetRequestSchema,
  resetConfirmSchema,
  verifyRequestSchema,
  verifyConfirmSchema,
} = require("../validations/auth.schema");
const authController = require("../controllers/auth.controller");
const passwordController = require("../controllers/password.controller");
const verificationController = require("../controllers/verification.controller");
const { authLimiter, tokenLimiter, resendLimiter } = require("../middlewares/rateLimiter");

const router = Router();

// Strict rate limits on authentication endpoints to slow down brute-force,
// credential-stuffing, and token-abuse attempts.
router.post("/register", authLimiter, validate(registerSchema), authController.register);
router.post("/login", authLimiter, validate(loginSchema), authController.login);
router.post("/refresh", tokenLimiter, validate(refreshTokenSchema), authController.refresh);
router.post("/logout", tokenLimiter, validate(refreshTokenSchema), authController.logout);
router.put("/password", requireAuth, validate(changePasswordSchema), passwordController.changePassword);
router.post("/password-reset/request", resendLimiter, validate(resetRequestSchema), passwordController.requestReset);
router.post("/password-reset/confirm", authLimiter, validate(resetConfirmSchema), passwordController.confirmReset);
router.post("/verify-email/resend", resendLimiter, validate(verifyRequestSchema), verificationController.resendVerification);
router.post("/verify-email/confirm", authLimiter, validate(verifyConfirmSchema), verificationController.confirmVerification);

module.exports = router;