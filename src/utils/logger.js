const fs = require("fs");
const path = require("path");
const config = require("../config");

const LOG_DIR = path.join(__dirname, "..", "..", "logs");
const LOG_FILE = path.join(LOG_DIR, "combined.log");
const LOG_MAX_BYTES = 1048576;
const LOG_RETAINED_FILES = 5;

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function formatLogEntry(level, message, meta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
}

function rotatedName(dir, index) {
  return path.join(dir, `combined.${index}.log`);
}

async function rotateCombinedLogs(dir) {
  const target = path.join(dir, "combined.log");
  try {
    const stat = await fs.promises.stat(target);
    if (stat.size < LOG_MAX_BYTES) return;
  } catch {
    return;
  }
  try {
    try {
      await fs.promises.unlink(rotatedName(dir, LOG_RETAINED_FILES));
    } catch {}
    for (let i = LOG_RETAINED_FILES - 1; i >= 1; i -= 1) {
      try {
        await fs.promises.rename(rotatedName(dir, i), rotatedName(dir, i + 1));
      } catch {}
    }
    await fs.promises.rename(target, rotatedName(dir, 1));
  } catch (err) {
    process.stderr.write(`[logger] Failed to rotate log file: ${err.message}\n`);
  }
}

async function appendLine(file, line) {
  try {
    await fs.promises.appendFile(file, line);
  } catch (err) {
    process.stderr.write(`[logger] Failed to write log file: ${err.message}\n`);
  }
}

let writeChain = Promise.resolve();

function enqueueWrite(file, line) {
  writeChain = writeChain.then(async () => {
    if (file === LOG_FILE) await rotateCombinedLogs(LOG_DIR);
    await appendLine(file, line);
  });
  writeChain.catch(() => {});
}

function write(level, message, meta) {
  const line = formatLogEntry(level, message, meta);

  if (level === "ERROR" || level === "WARN") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  const day = new Date().toISOString().slice(0, 10);
  enqueueWrite(LOG_FILE, line);
  enqueueWrite(path.join(LOG_DIR, `app-${day}.log`), line);
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

function requestLogger(req, res, next) {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    logger.info(
      `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
      { durationMs, ip: req.ip, reqId: req.id }
    );
  });
  next();
}

module.exports = {
  logger,
  requestLogger,
  LOG_DIR,
  LOG_FILE,
  LOG_MAX_BYTES,
  LOG_RETAINED_FILES,
  formatLogEntry,
  rotateCombinedLogs,
  appendLine,
};
