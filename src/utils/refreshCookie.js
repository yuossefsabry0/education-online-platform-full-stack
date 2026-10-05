const REFRESH_COOKIE_NAME = "refreshToken";

function isSecureEnv() {
  return String(process.env.NODE_ENV) === "production";
}

function refreshCookieMaxAge() {
  const raw = String(process.env.REFRESH_TOKEN_EXPIRES_IN || "7d").trim();
  const m = raw.match(/^(\d+)\s*([smhd])$/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    if (unit === "s") return n;
    if (unit === "m") return n * 60;
    if (unit === "h") return n * 60 * 60;
    return n * 24 * 60 * 60;
  }
  const asNumber = parseInt(raw, 10);
  if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
  return 7 * 24 * 60 * 60;
}

function setRefreshCookie(res, token) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${refreshCookieMaxAge()}`,
    "SameSite=Lax",
  ];
  if (isSecureEnv()) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  if (prev) {
    if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, parts.join("; ")]);
    else res.setHeader("Set-Cookie", [prev, parts.join("; ")]);
  } else {
    res.setHeader("Set-Cookie", parts.join("; "));
  }
}

function clearRefreshCookie(res) {
  const parts = [
    `${REFRESH_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "SameSite=Lax",
  ];
  if (isSecureEnv()) parts.push("Secure");
  const prev = res.getHeader("Set-Cookie");
  if (prev) {
    if (Array.isArray(prev)) res.setHeader("Set-Cookie", [...prev, parts.join("; ")]);
    else res.setHeader("Set-Cookie", [prev, parts.join("; ")]);
  } else {
    res.setHeader("Set-Cookie", parts.join("; "));
  }
}

function getPresentedRefreshToken(req) {
  if (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) return req.cookies[REFRESH_COOKIE_NAME];
  if (req.body && typeof req.body.refreshToken === "string" && req.body.refreshToken) {
    return req.body.refreshToken;
  }
  return null;
}

module.exports = {
  REFRESH_COOKIE_NAME,
  setRefreshCookie,
  clearRefreshCookie,
  getPresentedRefreshToken,
  refreshCookieMaxAge,
};
