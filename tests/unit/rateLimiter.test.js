// Rate limiting is configurable (RATE_LIMIT_ENABLED=false). During tests it is
// disabled so the integration suite never trips the auth limits; these tests
// verify that a disabled limiter passes requests straight through.
const { apiLimiter, authLimiter, tokenLimiter } = require("../../src/middlewares/rateLimiter");
const config = require("../../src/config");

describe("rate limiters (test environment)", () => {
  it("rate limiting is disabled by the test environment", () => {
    expect(config.rateLimit.enabled).toBe(false);
  });

  it.each([
    ["apiLimiter", apiLimiter],
    ["authLimiter", authLimiter],
    ["tokenLimiter", tokenLimiter],
  ])("%s passes requests through when disabled", (_name, limiter) => {
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    limiter({ headers: {}, ip: "127.0.0.1" }, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});