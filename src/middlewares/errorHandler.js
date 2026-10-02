const { Prisma } = require("@prisma/client");
const multer = require("multer");
const { error } = require("../utils/apiResponse");
const { logger } = require("../utils/logger");

const notFoundHandler = (req, res) => {
  return error(res, "Route not found", 404, "NOT_FOUND");
};

// Normalize unexpected errors (including Prisma/body-parser failures) into the
// standard { success, data, error } shape so every endpoint responds alike.
function normalizeError(err) {
  // Malformed JSON body sent to express.json()/express.urlencoded().
  if (err.type === "entity.parse.failed") {
    return { status: 400, code: "INVALID_JSON", message: "Malformed JSON body" };
  }
  if (err.type && err.type.startsWith("entity.")) {
    // e.g. entity.too.large (payload too big)
    return { status: 413, code: "PAYLOAD_TOO_LARGE", message: err.message };
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return { status: 413, code: "FILE_TOO_LARGE", message: "File too large" };
    }
    return { status: 400, code: "UPLOAD_ERROR", message: err.message };
  }

  // Prisma-known request errors (unique conflicts, missing records, FK, ...).
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case "P2002":
        return {
          status: 409,
          code: "DUPLICATE_FIELD",
          message: "A record with this value already exists",
          details: { fields: err.meta?.target || null },
        };
      case "P2025":
        return {
          status: 404,
          code: "NOT_FOUND",
          message: "Record not found",
        };
      case "P2003":
        return {
          status: 400,
          code: "FOREIGN_KEY_CONSTRAINT",
          message: "Referenced record does not exist",
          details: { field: err.meta?.field_name || null },
        };
      case "P2000":
        return {
          status: 400,
          code: "VALUE_TOO_LONG",
          message: "Provided value is too long for its column",
        };
      default:
        return { status: 500, code: "DATABASE_ERROR", message: "Database error" };
    }
  }

  return null;
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const normalized = normalizeError(err) || {};
  const status = err.status || err.statusCode || normalized.status || 500;
  // Mapped codes (Prisma / payload errors) take precedence over the raw
  // Prisma error code, while controller-thrown errors keep their own code.
  const code =
    normalized.code || err.code || (status === 500 ? "INTERNAL_ERROR" : "ERROR");
  const message =
    normalized.message || (status === 500 ? "Internal server error" : err.message);

  if (status === 500) {
    logger.error(message, { stack: err.stack, route: req.originalUrl });
  }

  const details =
    process.env.NODE_ENV === "development" && status === 500 && err.stack
      ? err.stack
      : normalized.details || err.details || null;

  return error(res, message, status, code, details);
};

module.exports = { notFoundHandler, errorHandler };