const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");

const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { requestLogger } = require("./utils/logger");
const swaggerDocument = require("../docs/swagger.json");

const { resolveCorsOrigins, buildCorsOptions } = require("./config/cors");

const app = express();

app.use(helmet());

const CORS_ALLOWLIST = resolveCorsOrigins(process.env);

app.use(cors(buildCorsOptions(CORS_ALLOWLIST)));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function parseCookieHeader(header) {
  const out = {};
  if (!header) return out;
  const parts = String(header).split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

app.use((req, res, next) => {
  req.cookies = parseCookieHeader(req.headers.cookie);
  next();
});

// Server-side operational log of every incoming request.
app.use(requestLogger);

// Swagger UI documentation (served on /api-docs) for browsing all endpoints.
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    customSiteTitle: "Education System API Documentation",
  })
);

// Global burst protection for every API route.
app.use("/api", apiLimiter, routes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;