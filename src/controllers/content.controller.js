const prisma = require("../db/prisma");
const { Prisma } = require("@prisma/client");
const { success, error } = require("../utils/apiResponse");
const { teacherIdParam } = require("../validations/subscription.schema");
const { contentListQuerySchema } = require("../validations/content.schema");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");
const { httpError } = require("../utils/httpError");
const {
  SECTION_DEFS,
  findActiveTeacher,
  listPublishedSectionContent,
  sectionDefFor,
  roleFor,
  filterContentByTitle,
  paginateItems,
} = require("../services/teacherContent");

const TYPE_SECTION_MAP = {
  LECTURE: "lectures",
  LESSON_CONTENT: "lesson-content",
  HOMEWORK: "homework",
};

const SECTION_TYPE_MAP = {
  lectures: "LECTURE",
  "lesson-content": "LESSON_CONTENT",
  homework: "HOMEWORK",
};

function parseTeacherId(raw) {
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

function cleanOriginalUrl(req) {
  return req.originalUrl.split("?")[0];
}

async function showContentPage(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);

    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const pageUrl = cleanOriginalUrl(req);
    const sections = SECTION_DEFS.map(({ key, label }) => ({
      key,
      label,
      route: `${pageUrl}/${key}`,
    }));

    return success(res, {
      roleRequired: roleFor(teacherId),
      teacher,
      sections,
      activeRoles: req.activeRoles,
    });
  } catch (err) {
    next(err);
  }
}

function parseListQuery(raw) {
  const result = contentListQuerySchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "query",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

async function showSection(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const section = req.params.section;
    const def = sectionDefFor(section);
    if (!def) {
      return error(res, "Unknown content section", 404, "SECTION_NOT_FOUND");
    }

    const contentType = SECTION_TYPE_MAP[section];

    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const query = parseListQuery(req.query);
    const all = await listPublishedSectionContent(teacherId, contentType);
    const filtered = filterContentByTitle(all, query.q);
    const { items, pagination } = paginateItems(filtered, query.page, query.limit);

    return success(res, {
      roleRequired: roleFor(teacherId),
      teacher,
      section: { key: def.key, label: def.label, content: items },
      pagination,
      activeRoles: req.activeRoles,
    });
  } catch (err) {
    next(err);
  }
}

// ---- Teacher Role Routes ----

async function showTeacherDashboard(req, res, next) {
  try {
    const teacherId = req.user.id;

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: {
        id: true,
        name: true,
        subject: true,
        gradeClass: true,
      },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const content = await prisma.teacherContent.findMany({
      where: { teacherId },
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
    });

    const query = parseListQuery(req.query);
    const sections = SECTION_DEFS.map(({ key, label }) => {
      const sectionContent = content.filter(
        (c) => TYPE_SECTION_MAP[c.type] === key
      );
      const searched = filterContentByTitle(sectionContent, query.q);
      const paged = paginateItems(searched, query.page, query.limit);
      return { key, label, content: paged.items, pagination: paged.pagination };
    });

    return success(res, {
      teacher,
      sections,
      actions: {
        subscribers: `/api/teacher/dashboard/subscribers`,
        income: `/api/teacher/dashboard/income`,
        addContent: `/api/teacher/dashboard/content`,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function viewSubscribers(req, res, next) {
  try {
    const teacherId = req.user.id;

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true, name: true },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const statusParam = req.query.status === undefined || req.query.status === "" ? null : req.query.status;
    if (statusParam !== null && !["ACTIVE", "EXPIRED", "CANCELLED"].includes(statusParam)) {
      return error(res, "Invalid status filter", 400, "VALIDATION_ERROR");
    }
    const page = req.query.page === undefined || req.query.page === "" ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined || req.query.limit === "" ? 10 : Number(req.query.limit);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      return error(res, "Invalid pagination", 400, "VALIDATION_ERROR");
    }

    const now = new Date();
    const where = statusParam === null
      ? { teacherId, ...activeSubscriptionWhere(now) }
      : { teacherId, status: statusParam };
    const [total, subscriptions] = await Promise.all([
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where,
        orderBy: { startDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          price: true,
          startDate: true,
          duration: true,
          status: true,
          student: {
            select: {
              id: true,
              name: true,
              email: true,
              username: true,
            },
          },
        },
      }),
    ]);

    const subscribers = subscriptions.map((sub) => ({
      subscriptionId: sub.id,
      name: sub.student.name,
      email: sub.student.email,
      username: sub.student.username,
      pricePaid: sub.price,
      subscriptionDate: sub.startDate,
      duration: sub.duration,
      status: sub.status,
    }));

    return success(res, {
      teacher: { id: teacher.id, name: teacher.name },
      totalSubscribers: total,
      subscribers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
}

async function addContent(req, res, next) {
  try {
    const teacherId = req.user.id;
    const { type, title, body, fileUrl, isPublished } = req.body;

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

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
      },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "CONTENT_ADDED",
        actorId: String(teacherId),
        actorType: "TEACHER",
        targetId: String(content.id),
        details: {
          contentType: type,
          title,
          teacherId,
        },
      },
    });

    return success(res, { content }, 201);
  } catch (err) {
    next(err);
  }
}

async function editContent(req, res, next) {
  try {
    const teacherId = req.user.id;
    const contentId = parseInt(req.params.contentId, 10);

    if (isNaN(contentId)) {
      return error(res, "Invalid content ID", 400, "VALIDATION_ERROR");
    }

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const existing = await prisma.teacherContent.findUnique({
      where: { id: contentId },
      select: { id: true, teacherId: true },
    });

    if (!existing) {
      return error(res, "Content not found", 404, "NOT_FOUND");
    }

    if (existing.teacherId !== teacherId) {
      return error(
        res,
        "Access denied: you can only modify your own content",
        403,
        "FORBIDDEN"
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
        actorId: String(teacherId),
        actorType: "TEACHER",
        targetId: String(contentId),
        details: {
          contentType: updated.type,
          title: updated.title,
          teacherId,
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
    const teacherId = req.user.id;
    const contentId = parseInt(req.params.contentId, 10);

    if (isNaN(contentId)) {
      return error(res, "Invalid content ID", 400, "VALIDATION_ERROR");
    }

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const existing = await prisma.teacherContent.findUnique({
      where: { id: contentId },
      select: { id: true, teacherId: true, type: true, title: true },
    });

    if (!existing) {
      return error(res, "Content not found", 404, "NOT_FOUND");
    }

    if (existing.teacherId !== teacherId) {
      return error(
        res,
        "Access denied: you can only delete your own content",
        403,
        "FORBIDDEN"
      );
    }

    await prisma.teacherContent.delete({ where: { id: contentId } });

    await prisma.logHistory.create({
      data: {
        actionType: "CONTENT_DELETED",
        actorId: String(teacherId),
        actorType: "TEACHER",
        targetId: String(contentId),
        details: {
          contentType: existing.type,
          title: existing.title,
          teacherId,
        },
      },
    });

    return success(res, { message: "Content deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function getIncome(req, res, next) {
  try {
    const teacherId = req.user.id;

    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true, name: true },
    });

    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const now = new Date();

    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );

    const threeMonthsAgo = new Date(now);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    const threeMonthsStart = new Date(
      threeMonthsAgo.getFullYear(),
      threeMonthsAgo.getMonth(),
      1
    );

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    const paidSubscriptions = await prisma.subscription.findMany({
      where: { teacherId, status: { in: ["ACTIVE", "EXPIRED"] } },
      select: {
        price: true,
        startDate: true,
      },
    });

    let currentMonthIncome = new Prisma.Decimal(0);
    let last3MonthsIncome = new Prisma.Decimal(0);
    let yearIncome = new Prisma.Decimal(0);

    for (const sub of paidSubscriptions) {
      const paymentDate = new Date(sub.startDate);
      const price = new Prisma.Decimal(sub.price.toString());

      if (paymentDate >= currentMonthStart && paymentDate <= currentMonthEnd) {
        currentMonthIncome = currentMonthIncome.plus(price);
      }

      if (paymentDate >= threeMonthsStart && paymentDate <= now) {
        last3MonthsIncome = last3MonthsIncome.plus(price);
      }

      if (paymentDate >= yearStart && paymentDate <= yearEnd) {
        yearIncome = yearIncome.plus(price);
      }
    }

    return success(res, {
      teacher: { id: teacher.id, name: teacher.name },
      income: {
        currentMonth: Number(currentMonthIncome.toString()),
        last3Months: Number(last3MonthsIncome.toString()),
        year: Number(yearIncome.toString()),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  showContentPage,
  showSection,
  showTeacherDashboard,
  viewSubscribers,
  addContent,
  editContent,
  deleteContent,
  getIncome,
};
