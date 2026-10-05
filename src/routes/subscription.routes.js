const { Router } = require("express");
const { requireAuth, optionalAuth } = require("../middlewares/auth");
const validate = require("../middlewares/validate");
const subscriptionController = require("../controllers/subscription.controller");
const { confirmPaymentSchema, webhookSchema } = require("../validations/subscription.schema");
const { paymentLimiter } = require("../middlewares/rateLimiter");

const router = Router();

// Calling student's own active subscriptions with teacher details.
// Powers the frontend "My Subscriptions" page.
router.get("/mine", requireAuth, subscriptionController.listMine);

// Subscription page for one teacher: available durations + prices.
// Reached after clicking "Subscribe" on the searched teacher.
router.get(
  "/teacher/:teacherId",
  requireAuth,
  subscriptionController.showPlans
);

// Confirm Payment entry point.
// Extensible: any payment method (gateway / provider) can be added later.
// Currently (no real payment gateway) it activates the subscription
// immediately; later the activation must move to the gateway webhook.
router.post(
  "/confirm-payment",
  requireAuth,
  paymentLimiter,
  validate(confirmPaymentSchema),
  subscriptionController.confirmPayment
);

router.post(
  "/webhook",
  optionalAuth,
  paymentLimiter,
  validate(webhookSchema),
  subscriptionController.subscriptionWebhook
);

router.post(
  "/:subscriptionId/cancel",
  requireAuth,
  subscriptionController.cancelMine
);

module.exports = router;