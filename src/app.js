const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const swaggerUi = require("swagger-ui-express");

const routes = require("./routes");
const { notFoundHandler, errorHandler } = require("./middlewares/errorHandler");
const { apiLimiter } = require("./middlewares/rateLimiter");
const { requestLogger } = require("./utils/logger");
const swaggerDocument = require("../docs/swagger.json");

const app = express();

app.use(helmet());

const CORS_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: CORS_ORIGINS.length ? CORS_ORIGINS : true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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