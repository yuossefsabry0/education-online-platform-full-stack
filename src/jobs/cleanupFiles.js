const fs = require("fs");
const path = require("path");
const config = require("../config");
const prisma = require("../db/prisma");
const { logger } = require("../utils/logger");
const { storageRoot, storedNameForUrl, STORED_NAME_PATTERN, deleteStored } = require("../utils/storage");

const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
const FILE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

let intervalHandle = null;
let running = false;

function checkUploadDir() {
  const raw = process.env.UPLOAD_DIR;
  if (raw && String(config.env) === "production" && !path.isAbsolute(raw)) {
    throw new Error("UPLOAD_DIR must be an absolute path in production");
  }
}

async function runFileCleanupPass(now) {
  if (running) return null;
  running = true;
  try {
    checkUploadDir();
    const root = storageRoot();
    let entries = [];
    try {
      entries = await fs.promises.readdir(root);
    } catch {
      return { scanned: 0, orphans: [] };
    }
    const current = now ? now.getTime() : Date.now();
    const rows = await prisma.teacherContent.findMany({
      where: { fileUrl: { not: null } },
      select: { fileUrl: true },
    });
    const referenced = new Set();
    for (const r of rows) {
      if (!r.fileUrl) continue;
      const s = String(r.fileUrl).trim();
      if (s.startsWith("http:") || s.startsWith("https:")) continue;
      const name = storedNameForUrl(s);
      if (name) referenced.add(name);
    }
    const orphans = [];
    for (const entry of entries) {
      if (!STORED_NAME_PATTERN.test(entry)) continue;
      if (referenced.has(entry)) continue;
      let mtime = 0;
      try {
        const stat = await fs.promises.stat(path.join(root, entry));
        mtime = stat.mtimeMs;
      } catch {
        continue;
      }
      if (current - mtime < ORPHAN_AGE_MS) continue;
      orphans.push(entry);
    }
    if (orphans.length > 0) {
      logger.warn("[file-cleanup] Removing unreferenced uploads", { count: orphans.length, files: orphans.slice(0, 50) });
      for (const entry of orphans) {
        await deleteStored(entry);
      }
    }
    return { scanned: entries.length, orphans };
  } catch (err) {
    console.error("[file-cleanup] Error running file cleanup pass:", err);
    return null;
  } finally {
    running = false;
  }
}

function startFileCleanupJob() {
  if (intervalHandle) return;
  checkUploadDir();
  intervalHandle = setInterval(runFileCleanupPass, FILE_CLEANUP_INTERVAL_MS);
}

function stopFileCleanupJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  runFileCleanupPass,
  startFileCleanupJob,
  stopFileCleanupJob,
  checkUploadDir,
  ORPHAN_AGE_MS,
  FILE_CLEANUP_INTERVAL_MS,
};
