const prisma = require("../db/prisma");
const { Prisma } = require("@prisma/client");
const { success, error } = require("../utils/apiResponse");
const { deriveTeacherRole } = require("../utils/teacherRole");
const { endDateForStartDuration } = require("../utils/date");
const { teacherIdParam } = require("../validations/subscription.schema");

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
    const err = new Error("Validation failed");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    err.details = details;
    throw err;
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
      status: { notIn: ["EXPIRED", "CANCELLED"] },
      endDate: { gt: now },
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
      const err = new Error("Teacher not found");
      err.status = 404;
      err.code = "TEACHER_NOT_FOUND";
      throw err;
    }

    // A user may hold only ONE active (non-expired, non-cancelled) subscription
    // per teacher at the same time, regardless of the chosen duration.
    const existing = await tx.subscription.findFirst({
      where: {
        studentId,
        teacherId,
        status: { notIn: ["EXPIRED", "CANCELLED"] },
        endDate: { gt: new Date() },
      },
      select: { id: true },
    });

    if (existing) {
      const err = new Error(
        "You already have an active subscription with this teacher."
      );
      err.status = 409;
      err.code = "ACTIVE_SUBSCRIPTION_EXISTS";
      throw err;
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
        const conflict = new Error(
          "You already have an active subscription with this teacher."
        );
        conflict.status = 409;
        conflict.code = "ACTIVE_SUBSCRIPTION_EXISTS";
        throw conflict;
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

module.exports = { showPlans, confirmPayment };