const jwt = require("jsonwebtoken");
const {
  signLoginToken,
  verifyLoginToken,
  signRefreshToken,
  verifyRefreshToken,
  extractBearerToken,
} = require("../../src/utils/token");
const config = require("../../src/config");

describe("token utils - login tokens", () => {
  it("signs and verifies a login token round-trip", () => {
    const token = signLoginToken({ userType: "student", id: 7 });
    const payload = verifyLoginToken(token);
    expect(payload.userType).toBe("student");
    expect(payload.id).toBe(7);
  });

  it("rejects tampered tokens", () => {
    const token = signLoginToken({ userType: "student", id: 1 });
    const tampered = `${token.slice(0, -2)}xx`;
    expect(() => verifyLoginToken(tampered)).toThrow();
  });
});

describe("token utils - refresh tokens", () => {
  it("uses the refresh secret, independent of the access secret", () => {
    const token = signRefreshToken({ userType: "admin", id: 3 });
    expect(verifyRefreshToken(token).userType).toBe("admin");
    // The same token must NOT verify under the access secret.
    expect(() => jwt.verify(token, config.jwt.accessSecret)).toThrow();
  });
});

describe("token utils - extractBearerToken", () => {
  it("extracts a Bearer token", () => {
    expect(extractBearerToken({ headers: { authorization: "Bearer abc.def" } })).toBe("abc.def");
  });

  it("is case-insensitive for the header name", () => {
    expect(extractBearerToken({ headers: { Authorization: "Bearer xyz" } })).toBe("xyz");
  });

  it("returns null when missing or malformed", () => {
    expect(extractBearerToken({ headers: {} })).toBeNull();
    expect(extractBearerToken({ headers: { authorization: "Basic abc" } })).toBeNull();
    expect(extractBearerToken({ headers: { authorization: "Bearer" } })).toBeNull();
  });
});