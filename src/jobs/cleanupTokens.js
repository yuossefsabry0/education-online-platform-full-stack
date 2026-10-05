const prisma = require("../db/prisma");
const { logger } = require("../utils/logger");

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

let intervalHandle = null;
let running = false;

async function runTokenCleanupPass(now) {
  if (running) return null;
  running = true;
  try {
    const cutoff = new Date((now ? now.getTime() : Date.now()) - RETENTION_MS);
    const removedRefresh = await prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    const removedReset = await prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    const removedVerify = await prisma.emailVerificationToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    const result = {
      refreshTokens: removedRefresh.count,
      passwordResetTokens: removedReset.count,
      emailVerificationTokens: removedVerify.count,
    };
    if (result.refreshTokens > 0 || result.passwordResetTokens > 0 || result.emailVerificationTokens > 0) {
      logger.info("[token-cleanup] Removed expired tokens", result);
    }
    return result;
  } catch (err) {
    console.error("[token-cleanup] Error running token cleanup pass:", err);
    return null;
  } finally {
    running = false;
  }
}

function startTokenCleanupJob() {
  if (intervalHandle) return;
  intervalHandle = setInterval(runTokenCleanupPass, CLEANUP_INTERVAL_MS);
}

function stopTokenCleanupJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  runTokenCleanupPass,
  startTokenCleanupJob,
  stopTokenCleanupJob,
  CLEANUP_INTERVAL_MS,
  RETENTION_MS,
};
