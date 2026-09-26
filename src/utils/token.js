const jwt = require("jsonwebtoken");
const config = require("../config");

function signLoginToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.loginTokenExpiresIn,
  });
}

function verifyLoginToken(token) {
  return jwt.verify(token, config.jwt.accessSecret);
}

function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

module.exports = {
  signLoginToken,
  verifyLoginToken,
  signRefreshToken,
  verifyRefreshToken,
  extractBearerToken,
};
