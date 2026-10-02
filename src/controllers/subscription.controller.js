const prisma = require("../db/prisma");
const { Prisma } = require("@prisma/client");
const { success, error } = require("../utils/apiResponse");
const { deriveTeacherRole } = require("../utils/teacherRole");
const { endDateForStartDuration } = require("../utils/date");
const { teacherIdParam, subscriptionIdParam, DURATIONS } = require("../validations/subscription.schema");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");
const { httpError } = require("../utils/httpError");
const { claimNotification, sendCancellationNotice } = require("../utils/subscriptionNotify");

const DURATION_PRICE_FIELD = {
  ONE_MONTH: "price1Month",
  THREE_MONTHS: "price3Months",
  SIX_MONTHS: "price6Months",
  ONE_YEAR: "price1Year",
};

const DURATION_LABEL = {
  ONE_MONTH: "1 Month",
  THREE_MONTHS: "3 Months",
  SIX_MONTHS: "6 Months",
  ONE_YEAR: "1 Year",
};

function isStudent(user) {
  return !!(user && user.userType === "student");
}

// Fix Task 5: MySQL reports the (studentId, activeSubscriptionKey) unique-index
// violation as a Prisma P2002 known request error. This predicate recognizes
// ONLY that constraint, so the application-level duplicate check remains the
// primary early guard while the database constraint provides the final
// concurrency guarantee.
//
// Two shapes are handled:
//  * classic Prisma connectors populate err.meta.target with the index name or
//    the column names involved in the conflict;
//  * the driver adapter (@prisma/adapter-mariadb) leaves meta.target undefined
//    and nests the violated index under meta.driverAdapterError.cause.constraint.
function isOneActiveSubscriptionConstraintError(err) {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;

  const meta = err.meta || {};
  const target = meta.target;
  if (Array.isArray(target)) {
    return target.includes("activeSubscriptionKey");
  }
  if (typeof target === "string" && target.includes("activeSubscriptionKey")) {
    return true;
  }

  const adapterError = meta.driverAdapterError;
  const cause = adapterError && adapterError.cause;
  const constraint = cause && cause.constraint;
  if (!constraint) return false;

  const fields = constraint.fields || constraint.columns;
  if (Array.isArray(fields)) {
    return fields.some((f) =>
      String(f).toLowerCase().includes("activesubscriptionkey")
    );
  }
  const names = [constraint.index, constraint.name, constraint.constraint];
  return names.some(
    (n) => typeof n === "string" && n.includes("activeSubscriptionKey")
  );
}

// ---------------------------------------------------------------------------
// Subscription page (pricing selection)
// Returns the available durations and their current prices for one teacher so
// the client can render the "Subscription" page after the user clicks Subscribe.
// ---------------------------------------------------------------------------
function parseTeacherIdParam(raw) {
  const result = teacherIdParam.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "teacherId",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

async function showPlans(req, res, next) {
  if (!isStudent(req.user)) {
    return error(
      res,
      "Only students can subscribe to teachers",
      403,
      "FORBIDDEN"
    );
  }

  let teacherId;
  try {
    teacherId = parseTeacherIdParam(req.params.teacherId);
  } catch (err) {
    return next(err);
  }

  const teacher = await prisma.teacher.findFirst({
    where: { id: teacherId, isActive: true },
    select: {
      id: true,
      name: true,
      subject: true,
      gradeClass: true,
      price1Month: true,
      price3Months: true,
      price6Months: true,
      price1Year: true,
    },
  });

  if (!teacher) {
    return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
  }

  const now = new Date();
  const activeSubscription = await prisma.subscription.findFirst({
    where: {
      studentId: req.user.id,
      teacherId: teacher.id,
      ...activeSubscriptionWhere(now),
    },
    select: {
      id: true,
      duration: true,
      price: true,
      startDate: true,
      endDate: true,
      teacherRole: true,
    },
  });

  const plans = Object.keys(DURATION_PRICE_FIELD).map((duration) => ({
    duration,
    label: DURATION_LABEL[duration],
    price: teacher[DURATION_PRICE_FIELD[duration]],
  }));

  return success(res, {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      subject: teacher.subject,
      gradeClass: teacher.gradeClass,
    },
    plans,
    hasActiveSubscription: Boolean(activeSubscription),
    activeSubscription: activeSubscription || null,
  });
}

// ---------------------------------------------------------------------------
// Activation logic — creates the subscription record inside a single database
// transaction together with the role grant record and the log history entry.
//
// NOTE ON EXTENSIBILITY: when a real payment gateway is integrated later, this
// function must be called from the gateway's confirmation callback / webhook
// (after the payment is verified) instead of directly from the one-click
// confirm-payment handler below. Keep this logic in one place so it can be
// reused by the webhook without duplicating the transaction.
// ---------------------------------------------------------------------------
async function activateSubscription({ studentId, teacherId, duration }) {
  if (!DURATIONS.includes(duration)) {
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", [
      { field: "duration", message: `duration must be one of: ${DURATIONS.join(", ")}` },
    ]);
  }
  return prisma.$transaction(async (tx) => {
    const teacher = await tx.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: {
        id: true,
        price1Month: true,
        price3Months: true,
        price6Months: true,
        price1Year: true,
      },
    });

    if (!teacher) {
      throw httpError(404, "TEACHER_NOT_FOUND", "Teacher not found");
    }

    // A user may hold only ONE active (non-expired, non-cancelled) subscription
    // per teacher at the same time, regardless of the chosen duration.
    const existing = await tx.subscription.findFirst({
      where: {
        studentId,
        teacherId,
        ...activeSubscriptionWhere(new Date()),
      },
      select: { id: true },
    });

    if (existing) {
      throw httpError(409, "ACTIVE_SUBSCRIPTION_EXISTS", "You already have an active subscription with this teacher.");
    }

    // Price is snapshotted from the teacher at the exact moment of
    // subscription and is never re-read or overwritten afterwards.
    const price = teacher[DURATION_PRICE_FIELD[duration]];

    // startDate equals the payment date; endDate is calendar-based.
    const startDate = new Date();
    const endDate = endDateForStartDuration(startDate, duration);

    const teacherRole = deriveTeacherRole(teacherId);

    let subscription;
    try {
      subscription = await tx.subscription.create({
        data: {
          studentId,
          teacherId,
          teacherRole,
          duration,
          price,
          startDate,
          endDate,
          status: "ACTIVE",
        },
        select: {
          id: true,
          teacherId: true,
          teacherRole: true,
          duration: true,
          price: true,
          startDate: true,
          endDate: true,
          status: true,
          createdAt: true,
        },
      });
    } catch (err) {
      // Concurrency safety net: if two confirm-payment requests race past the
      // application-level check above, the database unique constraint catches
      // the second insert. Map it to the same error the early check returns.
      if (isOneActiveSubscriptionConstraintError(err)) {
        throw httpError(409, "ACTIVE_SUBSCRIPTION_EXISTS", "You already have an active subscription with this teacher.");
      }
      throw err;
    }

    // Granting the role is represented by the ACTIVE subscription carrying its
    // derived teacherRole (SUB{teacherId}); the auth layer reads active
    // subscriptions to compute the user's roles, so creating this record is the
    // role-granting step. It happens atomically with creation and logging here.
    await tx.logHistory.create({
      data: {
        actionType: "SUBSCRIPTION_CREATED",
        actorId: String(studentId),
        actorType: "STUDENT",
        targetId: String(subscription.id),
        details: {
          teacherId,
          teacherRole,
          duration,
          price: price.toString(),
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      },
    });

    return subscription;
  });
}

// ---------------------------------------------------------------------------
// Confirm Payment.
// Dedicated route so that any payment method can be added into it in the
// future. Today there is no real payment gateway, so clicking "Confirm
// Payment" activates the subscription immediately. Once a gateway is
// integrated, the payment-processing code goes here and the
// activateSubscription call moves into the gateway's confirmation callback.
// ---------------------------------------------------------------------------
async function confirmPayment(req, res, next) {
  if (!isStudent(req.user)) {
    return error(
      res,
      "Only students can subscribe to teachers",
      403,
      "FORBIDDEN"
    );
  }

  const { teacherId, duration } = req.body;

  try {
    const subscription = await activateSubscription({
      studentId: req.user.id,
      teacherId,
      duration,
    });

    return success(
      res,
      {
        message: "Payment confirmed. Subscription activated.",
        subscription,
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// My Subscriptions.
// Lists the calling student's ACTIVE subscriptions with teacher details so
// the client can render a "My Subscriptions" page. Students only.
// ---------------------------------------------------------------------------
async function listMine(req, res, next) {
  try {
    if (!isStudent(req.user)) {
      return error(
        res,
        "Only students can view subscriptions",
        403,
        "FORBIDDEN"
      );
    }

    const now = new Date();
    const subscriptions = await prisma.subscription.findMany({
      where: {
        studentId: req.user.id,
        ...activeSubscriptionWhere(now),
        teacher: { isActive: true },
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        duration: true,
        startDate: true,
        endDate: true,
        status: true,
        teacher: {
          select: {
            id: true,
            name: true,
            subject: true,
            gradeClass: true,
          },
        },
      },
    });

    return success(res, { subscriptions });
  } catch (err) {
    next(err);
  }
}

function parseSubscriptionIdParam(raw) {
  const result = subscriptionIdParam.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "subscriptionId",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

async function cancelOwnSubscription({ studentId, subscriptionId }) {
  if (!Number.isInteger(subscriptionId) || subscriptionId <= 0) {
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", [
      { field: "subscriptionId", message: "subscriptionId must be a positive integer" },
    ]);
  }
  const existing = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: { id: true, studentId: true, status: true },
  });
  if (!existing) {
    throw httpError(404, "SUBSCRIPTION_NOT_FOUND", "Subscription not found");
  }
  if (existing.studentId !== studentId) {
    throw httpError(403, "FORBIDDEN", "You can only cancel your own subscriptions");
  }
  if (existing.status !== "ACTIVE") {
    throw httpError(409, "SUBSCRIPTION_NOT_ACTIVE", "Subscription is not active and cannot be cancelled");
  }
  const updated = await prisma.subscription.updateMany({
    where: { id: subscriptionId, studentId, status: "ACTIVE" },
    data: { status: "CANCELLED" },
  });
  if (updated.count !== 1) {
    throw httpError(409, "SUBSCRIPTION_NOT_ACTIVE", "Subscription is not active and cannot be cancelled");
  }
  const cancelled = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    select: {
      id: true,
      studentId: true,
      teacherId: true,
      teacherRole: true,
      duration: true,
      price: true,
      startDate: true,
      endDate: true,
      status: true,
      student: { select: { id: true, name: true, email: true } },
      teacher: { select: { id: true, name: true } },
    },
  });
  await prisma.logHistory.create({
    data: {
      actionType: "SUBSCRIPTION_CANCELLED",
      actorId: String(studentId),
      actorType: "STUDENT",
      targetId: String(subscriptionId),
      details: {
        studentId: cancelled.studentId,
        teacherId: cancelled.teacherId,
        teacherRole: cancelled.teacherRole,
        duration: cancelled.duration,
        price: cancelled.price.toString(),
      },
    },
  });
  if (await claimNotification(subscriptionId, "cancelNotifiedAt")) {
    await sendCancellationNotice(cancelled);
  }
  return {
    id: cancelled.id,
    studentId: cancelled.studentId,
    teacherId: cancelled.teacherId,
    teacherRole: cancelled.teacherRole,
    status: cancelled.status,
  };
}

async function cancelMine(req, res, next) {
  try {
    if (!isStudent(req.user)) {
      return error(
        res,
        "Only students can cancel subscriptions",
        403,
        "FORBIDDEN"
      );
    }
    let subscriptionId;
    try {
      subscriptionId = parseSubscriptionIdParam(req.params.subscriptionId);
    } catch (err) {
      return next(err);
    }
    const subscription = await cancelOwnSubscription({
      studentId: req.user.id,
      subscriptionId,
    });
    return success(res, {
      message: "Subscription cancelled.",
      subscription,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { showPlans, confirmPayment, listMine, cancelMine, cancelOwnSubscription, activateSubscription, DURATION_PRICE_FIELD };