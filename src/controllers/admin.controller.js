const bcrypt = require("bcryptjs");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");
const { httpError } = require("../utils/httpError");
const { toMoneyString } = require("../utils/money");
const { deriveTeacherRole } = require("../utils/teacherRole");
const { claimNotification, sendCancellationNotice } = require("../utils/subscriptionNotify");
const {
  idParam,
  subscribersQuerySchema,
  perTeacherSubscribersQuerySchema,
  logsQuerySchema,
} = require("../validations/admin.schema");

const PASSWORD_SALT_ROUNDS = config.security.bcryptRounds;

const SUBSCRIBER_SELECT = {
  id: true,
  teacherRole: true,
  duration: true,
  price: true,
  startDate: true,
  endDate: true,
  status: true,
  createdAt: true,
  student: {
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      createdAt: true,
    },
  },
  teacher: {
    select: {
      id: true,
      name: true,
      subject: true,
      gradeClass: true,
    },
  },
};

function parseSchema(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "value",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

function parseIdParam(raw) {
  return parseSchema(idParam, raw);
}

function buildPagination(total, page, limit) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

function subscriberOrderBy(sortBy, sortOrder) {
  switch (sortBy) {
    case "studentName":
      return { student: { name: sortOrder } };
    case "studentUsername":
      return { student: { username: sortOrder } };
    case "studentEmail":
      return { student: { email: sortOrder } };
    case "teacherName":
      return { teacher: { name: sortOrder } };
    default:
      return { [sortBy]: sortOrder };
  }
}

function mapSubscription(sub) {
  return {
    id: sub.id,
    teacherRole: sub.teacherRole,
    duration: sub.duration,
    price: sub.price,
    startDate: sub.startDate,
    endDate: sub.endDate,
    status: sub.status,
    subscriptionDate: sub.createdAt,
    student: sub.student,
    teacher: sub.teacher || null,
  };
}

async function checkTeacherDuplicates({ username, email, excludeId }) {
  const orClauses = [];
  if (username !== undefined) orClauses.push({ username });
  if (email !== undefined) orClauses.push({ email });
  if (!orClauses.length) return null;

  const where = { OR: orClauses };
  if (excludeId !== undefined) where.NOT = { id: excludeId };

  return prisma.teacher.findFirst({
    where,
    select: { id: true, username: true, email: true },
  });
}

async function ensureTeacherExists(teacherId) {
  return prisma.teacher.findUnique({
    where: { id: teacherId },
    select: { id: true, name: true },
  });
}

async function listSubscribers(req, res, next) {
  try {
    const query = parseSchema(subscribersQuerySchema, req.query);
    const orderBy = subscriberOrderBy(query.sortBy, query.sortOrder);
    const where = query.status ? { status: query.status } : {};

    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        select: SUBSCRIBER_SELECT,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return success(res, {
      subscribers: subscriptions.map(mapSubscription),
      pagination: buildPagination(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function listTeacherSubscribers(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const teacher = await ensureTeacherExists(teacherId);
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const query = parseSchema(perTeacherSubscribersQuerySchema, req.query);
    const where = { teacherId };
    if (query.status) where.status = query.status;
    const orderBy = subscriberOrderBy(query.sortBy, query.sortOrder);

    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        select: SUBSCRIBER_SELECT,
        orderBy,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return success(res, {
      teacher,
      totalSubscribers: total,
      subscribers: subscriptions.map(mapSubscription),
      pagination: buildPagination(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function getTotalIncome(req, res, next) {
  try {
    const [paid, cancelled] = await Promise.all([
      prisma.subscription.aggregate({
        _sum: { price: true },
        _count: true,
        where: { status: { not: "CANCELLED" } },
      }),
      prisma.subscription.count({ where: { status: "CANCELLED" } }),
    ]);

    const raw = paid._sum.price;
    const totalIncome = toMoneyString(raw === null || raw === undefined ? null : raw.toString());

    return success(res, {
      totalIncome,
      totalPayments: paid._count,
      cancelledPayments: cancelled,
    });
  } catch (err) {
    next(err);
  }
}

const TEACHER_FULL_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  subject: true,
  gradeClass: true,
  photoUrl: true,
  price1Month: true,
  price3Months: true,
  price6Months: true,
  price1Year: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  contents: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      fileUrl: true,
      isPublished: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  subscriptions: {
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      studentId: true,
      teacherRole: true,
      duration: true,
      price: true,
      startDate: true,
      endDate: true,
      status: true,
      createdAt: true,
      student: {
        select: { id: true, name: true, username: true, email: true },
      },
    },
  },
};

async function getTeacherDetail(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: TEACHER_FULL_SELECT,
    });

    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    // The password hash is a credential, not profile data; it is never exposed.
    // Admin can change it via the edit route.
    const { password, ...safeTeacher } = teacher;

    return success(res, {
      teacher: safeTeacher,
      role: deriveTeacherRole(teacherId),
    });
  } catch (err) {
    next(err);
  }
}

async function editTeacher(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const teacher = await ensureTeacherExists(teacherId);
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const { password, ...rest } = req.body;

    const duplicate = await checkTeacherDuplicates({
      username: rest.username,
      email: rest.email,
      excludeId: teacherId,
    });
    if (duplicate) {
      const field =
        duplicate.username === rest.username ? "username" : "email";
      return error(
        res,
        `${field === "username" ? "Username" : "Email"} already in use`,
        409,
        "DUPLICATE_FIELD",
        { field }
      );
    }

    const data = { ...rest };
    if (password !== undefined) {
      data.password = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
    }
    if (Object.keys(data).length === 0) {
      return error(res, "No fields to update", 400, "VALIDATION_ERROR");
    }

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data,
      select: TEACHER_FULL_SELECT,
    });

    await prisma.logHistory.create({
      data: {
        actionType: "TEACHER_UPDATED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(teacherId),
        details: {
          updatedFields: Object.keys(rest).concat(
            password !== undefined ? ["password"] : []
          ),
        },
      },
    });

    // Dedicated photo-change record so the teacher's notification feed and
    // the change history show exactly when the admin changed the photo.
    if (rest.photoUrl !== undefined) {
      await prisma.logHistory.create({
        data: {
          actionType: "TEACHER_PHOTO_UPDATED",
          actorId: String(req.user.id),
          actorType: "ADMIN",
          targetId: String(teacherId),
          details: {
            teacherId,
            photoUrl: updated.photoUrl || null,
            changedAt: new Date().toISOString(),
          },
        },
      });
    }

    return success(res, { teacher: updated });
  } catch (err) {
    next(err);
  }
}

async function addTeacher(req, res, next) {
  try {
    const {
      name,
      username,
      email,
      password,
      subject,
      gradeClass,
      price1Month,
      price3Months,
      price6Months,
      price1Year,
    } = req.body;

    const duplicate = await checkTeacherDuplicates({ username, email });
    if (duplicate) {
      const field = duplicate.username === username ? "username" : "email";
      return error(
        res,
        `${field === "username" ? "Username" : "Email"} already in use`,
        409,
        "DUPLICATE_FIELD",
        { field }
      );
    }

    const teacher = await prisma.teacher.create({
      data: {
        name,
        username,
        email,
        password: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS),
        subject,
        gradeClass,
        price1Month,
        price3Months,
        price6Months,
        price1Year,
      },
      select: TEACHER_FULL_SELECT,
    });

    await prisma.logHistory.create({
      data: {
        actionType: "TEACHER_CREATED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(teacher.id),
        details: {
          username: teacher.username,
          email: teacher.email,
          subject: teacher.subject,
          gradeClass: teacher.gradeClass,
        },
      },
    });

    return success(res, { teacher }, 201);
  } catch (err) {
    next(err);
  }
}

async function deleteTeacher(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true, name: true, username: true },
    });
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const now = new Date();
    const activeSubscription = await prisma.subscription.findFirst({
      where: {
        teacherId,
        ...activeSubscriptionWhere(now),
      },
      select: { id: true },
    });

    if (activeSubscription) {
      return error(
        res,
        "Cannot delete a teacher with active subscribers. Cancel their active subscription(s) or wait for them to expire first.",
        409,
        "ACTIVE_SUBSCRIPTIONS_EXIST"
      );
    }

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: { isActive: false },
      select: { id: true, isActive: true },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "TEACHER_DELETED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(teacherId),
        details: {
          name: teacher.name,
          username: teacher.username,
          softDeleted: true,
        },
      },
    });

    return success(res, {
      message:
        "Teacher soft-deleted. Their content and historical (non-active) subscription records are preserved for audit.",
      teacher: updated,
    });
  } catch (err) {
    next(err);
  }
}

async function addContent(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const teacher = await ensureTeacherExists(teacherId);
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const { type, title, body, fileUrl, isPublished } = req.body;

    const content = await prisma.teacherContent.create({
      data: {
        teacherId,
        type,
        title,
        body: body || null,
        fileUrl: fileUrl || null,
        isPublished: isPublished !== undefined ? isPublished : true,
      },
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        fileUrl: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "CONTENT_ADDED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(content.id),
        details: { teacherId, contentType: type, title },
      },
    });

    return success(res, { content }, 201);
  } catch (err) {
    next(err);
  }
}

async function editContent(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const contentId = parseIdParam(req.params.contentId);

    const teacher = await ensureTeacherExists(teacherId);
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const existing = await prisma.teacherContent.findUnique({
      where: { id: contentId },
      select: { id: true, teacherId: true },
    });
    if (!existing) return error(res, "Content not found", 404, "NOT_FOUND");
    if (existing.teacherId !== teacherId) {
      return error(
        res,
        "Content does not belong to this teacher",
        409,
        "INVALID_TEACHER_CONTENT"
      );
    }

    const { type, title, body, fileUrl, isPublished } = req.body;
    const updateData = {};
    if (type !== undefined) updateData.type = type;
    if (title !== undefined) updateData.title = title;
    if (body !== undefined) updateData.body = body;
    if (fileUrl !== undefined) updateData.fileUrl = fileUrl;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

    if (Object.keys(updateData).length === 0) {
      return error(res, "No fields to update", 400, "VALIDATION_ERROR");
    }

    const updated = await prisma.teacherContent.update({
      where: { id: contentId },
      data: updateData,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        fileUrl: true,
        isPublished: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "CONTENT_EDITED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(contentId),
        details: {
          teacherId,
          contentType: updated.type,
          title: updated.title,
          updatedFields: Object.keys(updateData),
        },
      },
    });

    return success(res, { content: updated });
  } catch (err) {
    next(err);
  }
}

async function deleteContent(req, res, next) {
  try {
    const teacherId = parseIdParam(req.params.teacherId);
    const contentId = parseIdParam(req.params.contentId);

    const teacher = await ensureTeacherExists(teacherId);
    if (!teacher) return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");

    const existing = await prisma.teacherContent.findUnique({
      where: { id: contentId },
      select: { id: true, teacherId: true, type: true, title: true },
    });
    if (!existing) return error(res, "Content not found", 404, "NOT_FOUND");
    if (existing.teacherId !== teacherId) {
      return error(
        res,
        "Content does not belong to this teacher",
        409,
        "INVALID_TEACHER_CONTENT"
      );
    }

    await prisma.teacherContent.delete({ where: { id: contentId } });

    await prisma.logHistory.create({
      data: {
        actionType: "CONTENT_DELETED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(contentId),
        details: { teacherId, contentType: existing.type, title: existing.title },
      },
    });

    return success(res, { message: "Content deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function getLogHistory(req, res, next) {
  try {
    const query = parseSchema(logsQuerySchema, req.query);

    const where = {};
    if (query.actionType) where.actionType = query.actionType;
    if (query.actorType) where.actorType = query.actorType;

    const [total, logs] = await Promise.all([
      prisma.logHistory.count({ where }),
      prisma.logHistory.findMany({
        where,
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return success(res, {
      logs,
      pagination: buildPagination(total, query.page, query.limit),
    });
  } catch (err) {
    next(err);
  }
}

async function cancelSubscription(req, res, next) {
  try {
    const subscriptionId = parseIdParam(req.params.subscriptionId);

    const subscription = await prisma.subscription.findUnique({
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
      },
    });
    if (!subscription) {
      return error(res, "Subscription not found", 404, "SUBSCRIPTION_NOT_FOUND");
    }
    if (subscription.status !== "ACTIVE") {
      return error(
        res,
        "Subscription is not active and cannot be cancelled",
        409,
        "SUBSCRIPTION_NOT_ACTIVE"
      );
    }

    const updated = await prisma.subscription.updateMany({
      where: { id: subscriptionId, status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
    if (updated.count !== 1) {
      return error(
        res,
        "Subscription is not active and cannot be cancelled",
        409,
        "SUBSCRIPTION_NOT_ACTIVE"
      );
    }

    const cancelled = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        studentId: true,
        teacherId: true,
        teacherRole: true,
        status: true,
        student: { select: { id: true, name: true, email: true } },
        teacher: { select: { id: true, name: true } },
      },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "SUBSCRIPTION_CANCELLED",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: String(subscriptionId),
        details: {
          studentId: subscription.studentId,
          teacherId: subscription.teacherId,
          teacherRole: subscription.teacherRole,
          duration: subscription.duration,
          price: subscription.price.toString(),
          startDate: subscription.startDate.toISOString(),
          endDate: subscription.endDate.toISOString(),
        },
      },
    });

    if (await claimNotification(subscriptionId, "cancelNotifiedAt")) {
      await sendCancellationNotice(cancelled);
    }

    return success(res, {
      message:
        "Subscription cancelled. The subscriber's access to this teacher's content has been revoked immediately; their other roles remain unaffected.",
      subscription: cancelled,
    });
  } catch (err) {
    next(err);
  }
}

async function broadcastNotification(req, res, next) {
  try {
    const { title, message } = req.body;
    const created = await prisma.logHistory.create({
      data: {
        actionType: "ANNOUNCEMENT",
        actorId: String(req.user.id),
        actorType: "ADMIN",
        targetId: "all",
        details: {
          title: title.trim(),
          message: message.trim(),
        },
      },
    });
    return success(
      res,
      {
        notification: {
          id: created.id,
          title: created.details.title,
          message: created.details.message,
          timestamp: created.timestamp,
        },
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSubscribers,
  listTeacherSubscribers,
  getTotalIncome,
  getTeacherDetail,
  editTeacher,
  addTeacher,
  deleteTeacher,
  addContent,
  editContent,
  deleteContent,
  getLogHistory,
  cancelSubscription,
  broadcastNotification,
};