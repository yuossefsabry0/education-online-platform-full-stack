const DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

function parseOrigins(raw) {
  return String(raw || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function resolveCorsOrigins(env) {
  const e = env || process.env;
  const configured = parseOrigins(e.CORS_ORIGINS);
  if (configured.length) return configured;
  if (String(e.NODE_ENV) === "production") {
    throw new Error("CORS_ORIGINS must be set to an explicit allowlist in production");
  }
  return DEV_ORIGINS.slice();
}

function buildCorsOptions(allowlist) {
  return {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowlist.indexOf(origin) !== -1) return callback(null, true);
      return callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  };
}

module.exports = { DEV_ORIGINS, parseOrigins, resolveCorsOrigins, buildCorsOptions };
