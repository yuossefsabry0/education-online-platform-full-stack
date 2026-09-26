const fs = require("fs");
const path = require("path");
const config = require("../config");

// ---------------------------------------------------------------------------
// Server-side developer/operational logging.
// Writes timestamped entries to a rotating log file (logs/combined.log) while
// still mirroring them to the console. Independent from the in-app "Log
// History" (LogHistory table) which is user-facing audit data.
// ---------------------------------------------------------------------------

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "combined.log");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatLogEntry(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function write(level, message, meta) {
  const line = formatLogEntry(level, message, meta);

  // Mirror to stdout/stderr for live terminal viewing.
  if (level === "ERROR" || level === "WARN") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  // Append to the dated log file. Also keep per-day files for easy browsing.
  const day = new Date().toISOString().slice(0, 10);
  try {
    fs.appendFileSync(LOG_FILE, line);
    fs.appendFileSync(path.join(LOG_DIR, `app-${day}.log`), line);
  } catch (err) {
    // Never let logging failures crash the request handling.
    process.stderr.write(`[logger] Failed to write log file: ${err.message}\n`);
  }
}

const logger = {
  info: (message, meta) => write("INFO", message, meta),
  warn: (message, meta) => write("WARN", message, meta),
  error: (message, meta) => write("ERROR", message, meta),
  debug: (message, meta) => {
    if (config.env === "development" || config.env === "test") {
      write("DEBUG", message, meta);
    }
  },
};

// Convenience: HTTP request logger middleware records each incoming request.
function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logger.info(
      `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
      { durationMs, ip: req.ip }
    );
  });
  next();
}

module.exports = { logger, requestLogger };