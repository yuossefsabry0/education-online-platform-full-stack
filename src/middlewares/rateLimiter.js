const rateLimit = require("express-rate-limit");
const config = require("../config");
const { error } = require("../utils/apiResponse");

// Centralized rate-limit error handler so the response keeps the
// standard { success, data, error } wrapper used everywhere else.
const handler = (req, res, next) => {
  return error(
    res,
    "Too many requests, please try again later",
    429,
    "RATE_LIMIT_EXCEEDED"
  );
};

// Pass-through middleware used while rate limiting is disabled (integration
// tests set RATE_LIMIT_ENABLED=false so they never trip the auth limits).
const noop = (req, res, next) => next();

// Builds a limiter, or a no-op, depending on the enabled flag.
const buildLimiter = (options) =>
  config.rateLimit.enabled
    ? rateLimit({ ...options, standardHeaders: true, legacyHeaders: false, handler })
    : noop;

// Generic API limiter applied to every /api route (moderate burst allowance).
const apiLimiter = buildLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  limit: 100, // max 100 requests per minute per IP
});

// Strict limiter for authentication endpoints (login/register), which are
// prime targets for credential stuffing / brute-force attacks.
const authLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // max 10 attempts per 15 minutes per IP
});

// Slightly stricter for refresh/logout token rotation abuse.
const tokenLimiter = buildLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 30,
});

const resendLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
});

const paymentLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

const uploadLimiter = buildLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 20,
});

module.exports = { apiLimiter, authLimiter, tokenLimiter, resendLimiter, paymentLimiter, uploadLimiter, buildLimiter };