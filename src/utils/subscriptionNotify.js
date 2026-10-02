const prisma = require("../db/prisma");
const mailer = require("./mailer");
const { toMoneyString } = require("./money");

async function claimNotification(subscriptionId, field) {
  const claimed = await prisma.subscription.updateMany({
    where: { id: subscriptionId, [field]: null },
    data: { [field]: new Date() },
  });
  return claimed.count === 1;
}

async function unclaimNotification(subscriptionId, field) {
  await prisma.subscription.updateMany({
    where: { id: subscriptionId },
    data: { [field]: null },
  });
}

async function recordNotification({ actionType, subscriptionId, studentId, email, status, errorText }) {
  await prisma.logHistory.create({
    data: {
      actionType,
      actorId: studentId === undefined || studentId === null ? null : String(studentId),
      actorType: "SYSTEM",
      targetId: String(subscriptionId),
      details: { email, status, error: errorText || null },
    },
  });
}

function cancellationCopy(subscription) {
  const teacher = subscription.teacher ? subscription.teacher.name : `teacher ${subscription.teacherId}`;
  return {
    subject: "Subscription cancelled",
    text: `Your subscription to ${teacher} (${subscription.duration}, ${toMoneyString(subscription.price)}) has been cancelled.`,
  };
}

function expiryCopy(subscription) {
  const teacher = subscription.teacher ? subscription.teacher.name : `teacher ${subscription.teacherId}`;
  return {
    subject: "Subscription expired",
    text: `Your subscription to ${teacher} (${subscription.duration}) has expired.`,
  };
}

async function sendCancellationNotice(subscription) {
  const email = subscription.student ? subscription.student.email : null;
  if (!email) {
    await recordNotification({
      actionType: "SUBSCRIPTION_CANCEL_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email: null,
      status: "skipped",
      errorText: "missing recipient",
    });
    return "skipped";
  }
  const copy = cancellationCopy(subscription);
  try {
    await mailer.sendMail({ to: email, subject: copy.subject, text: copy.text });
    await recordNotification({
      actionType: "SUBSCRIPTION_CANCEL_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email,
      status: "sent",
    });
    return "sent";
  } catch (err) {
    await recordNotification({
      actionType: "SUBSCRIPTION_CANCEL_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email,
      status: "failed",
      errorText: err.message,
    });
    return "failed";
  }
}

async function sendExpiryNotice(subscription) {
  const email = subscription.student ? subscription.student.email : null;
  if (!email) {
    await recordNotification({
      actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email: null,
      status: "skipped",
      errorText: "missing recipient",
    });
    return "skipped";
  }
  const copy = expiryCopy(subscription);
  try {
    await mailer.sendMail({ to: email, subject: copy.subject, text: copy.text });
    await recordNotification({
      actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email,
      status: "sent",
    });
    return "sent";
  } catch (err) {
    await recordNotification({
      actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED",
      subscriptionId: subscription.id,
      studentId: subscription.studentId,
      email,
      status: "failed",
      errorText: err.message,
    });
    return "failed";
  }
}

module.exports = {
  claimNotification,
  unclaimNotification,
  recordNotification,
  sendCancellationNotice,
  sendExpiryNotice,
};
