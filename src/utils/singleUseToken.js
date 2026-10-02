const crypto = require("crypto");

function newRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

module.exports = { newRawToken, hashToken };
