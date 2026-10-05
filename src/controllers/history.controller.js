const prisma = require("../db/prisma");
const { success, error } = require("../utils/apiResponse");
const { httpError } = require("../utils/httpError");
const { historyQuerySchema } = require("../validations/history.schema");

function parseHistoryQuery(raw) {
  const result = historyQuerySchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "query",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

function buildPagination(total, page, limit) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

async function history(req, res, next) {
  try {
    if (!req.user || req.user.userType !== "student") {
      return error(res, "Only students can view their history", 403, "FORBIDDEN");
    }
    const query = parseHistoryQuery(req.query);
    const subPage = query.subPage ?? query.page;
    const eventPage = query.eventPage ?? query.page;
    const subSkip = (subPage - 1) * query.limit;
    const eventSkip = (eventPage - 1) * query.limit;
    const eventWhere = { actorId: String(req.user.id), actorType: { in: ["STUDENT", "SYSTEM"] } };
    const [subTotal, subscriptions, eventTotal, events] = await Promise.all([
      prisma.subscription.count({ where: { studentId: req.user.id } }),
      prisma.subscription.findMany({
        where: { studentId: req.user.id },
        orderBy: { startDate: "desc" },
        skip: subSkip,
        take: query.limit,
        select: {
          id: true,
          duration: true,
          price: true,
          startDate: true,
          endDate: true,
          status: true,
          teacherRole: true,
          teacher: { select: { id: true, name: true, subject: true } },
        },
      }),
      prisma.logHistory.count({ where: eventWhere }),
      prisma.logHistory.findMany({
        where: eventWhere,
        orderBy: { timestamp: "desc" },
        skip: eventSkip,
        take: query.limit,
        select: {
          id: true,
          actionType: true,
          targetId: true,
          timestamp: true,
          details: true,
        },
      }),
    ]);
    return success(res, {
      subscriptions: {
        items: subscriptions,
        pagination: buildPagination(subTotal, subPage, query.limit),
      },
      events: {
        items: events,
        pagination: buildPagination(eventTotal, eventPage, query.limit),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { history };
