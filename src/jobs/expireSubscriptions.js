const prisma = require("../db/prisma");
const config = require("../config");
const {
  claimNotification,
  unclaimNotification,
  sendExpiryNotice,
} = require("../utils/subscriptionNotify");

// Lightweight scheduled job (setInterval) that periodically marks subscriptions
// whose endDate has passed as EXPIRED and writes the SUBSCRIPTION_EXPIRED log
// entry at that moment. The on-request check from the Authorization layer still
// provides immediate revocation; this job guarantees expiration is logged even
// when no request happens to trigger it.

const CHECK_INTERVAL_MS = config.jobs.expiryIntervalMs;

let intervalHandle = null;
let running = false;

async function notifyExpired(subscriptionId) {
  if (await claimNotification(subscriptionId, "expiryNotifiedAt")) {
    const full = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        teacherRole: true,
        duration: true,
        price: true,
        student: { select: { id: true, name: true, email: true } },
        teacher: { select: { id: true, name: true } },
      },
    });
    const outcome = await sendExpiryNotice(full);
    if (outcome === "failed") {
      await unclaimNotification(subscriptionId, "expiryNotifiedAt");
    }
  }
}

async function runExpirationPass() {
  if (running) return;
  running = true;
  try {
    const now = new Date();

    const expired = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        endDate: { lte: now },
      },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        teacherRole: true,
        duration: true,
        price: true,
        startDate: true,
        endDate: true,
      },
    });

    const pendingNotice = await prisma.subscription.findMany({
      where: {
        status: "EXPIRED",
        endDate: { lte: now },
        expiryNotifiedAt: null,
      },
      select: { id: true },
    });

    for (const sub of expired) {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.subscription.updateMany({
          where: { id: sub.id, status: "ACTIVE" },
          data: { status: "EXPIRED" },
        });

        if (updated.count === 0) return;

        await tx.logHistory.create({
          data: {
            actionType: "SUBSCRIPTION_EXPIRED",
            actorId: String(sub.studentId),
            actorType: "STUDENT",
            targetId: String(sub.id),
            details: {
              teacherId: sub.teacherId,
              teacherRole: sub.teacherRole,
              duration: sub.duration,
              price: sub.price.toString(),
              startDate: sub.startDate.toISOString(),
              endDate: sub.endDate.toISOString(),
            },
          },
        });
      });

      await notifyExpired(sub.id);
    }

    for (const sub of pendingNotice) {
      await notifyExpired(sub.id);
    }

    if (expired.length > 0) {
      console.log(`[subscription-expiry] Expired ${expired.length} subscription(s)`);
    }
  } catch (err) {
    console.error("[subscription-expiry] Error running expiration pass:", err);
  } finally {
    running = false;
  }
}

function startExpirationJob() {
  if (intervalHandle) return;
  console.log(
    `[subscription-expiry] Starting job (every ${CHECK_INTERVAL_MS / 1000}s)`
  );
  intervalHandle = setInterval(runExpirationPass, CHECK_INTERVAL_MS);
  runExpirationPass(); // also run once at startup
}

function stopExpirationJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  runExpirationPass,
  startExpirationJob,
  stopExpirationJob,
  CHECK_INTERVAL_MS,
};