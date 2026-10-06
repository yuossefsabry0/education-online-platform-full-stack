const prisma = require("../db/prisma");
const { success, error } = require("../utils/apiResponse");
const { activeSubscriptionWhere } = require("../utils/subscriptionStatus");

// GET /api/user/notifications — notification feed (students + teachers).
// Students: login, new-subscription, payment, expiry and new-lecture events.
// Teachers: platform-wide announcements plus admin photo-change notices.
// Every item carries its backend timestamp plus details; sorted newest first.
const DURATION_LABELS = {
  ONE_MONTH: "1 month",
  THREE_MONTHS: "3 months",
  SIX_MONTHS: "6 months",
  ONE_YEAR: "12 months",
};

function parseLimit(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n)) return 20;
  return Math.min(Math.max(n, 1), 50);
}

function toAnnouncementItems(rows) {
  return (rows || []).map((a) => ({
    id: `announcement-${a.id}`,
    type: "announcement",
    title: (a.details && a.details.title) || "Announcement",
    message: (a.details && a.details.message) || "",
    timestamp: a.timestamp,
    link: null,
  }));
}

async function list(req, res, next) {
  try {
    if (!req.user || (req.user.userType !== "student" && req.user.userType !== "teacher")) {
      return error(res, "Only students and teachers have notifications", 403, "FORBIDDEN");
    }
    const limit = parseLimit(req.query && req.query.limit);

    const announcements = await prisma.logHistory.findMany({
      where: { actionType: "ANNOUNCEMENT" },
      orderBy: { timestamp: "desc" },
      take: 10,
      select: { id: true, timestamp: true, details: true },
    });

    if (req.user.userType === "teacher") {
      const teacherId = req.user.id;
      const photoChanges = await prisma.logHistory.findMany({
        where: { actionType: "TEACHER_PHOTO_UPDATED" },
        orderBy: { timestamp: "desc" },
        take: 20,
        select: { id: true, timestamp: true, details: true },
      });
      const notifications = [
        ...toAnnouncementItems(announcements),
        ...photoChanges
          .filter((p) => p.details && p.details.teacherId === teacherId)
          .map((p) => ({
            id: `photo-${p.id}`,
            type: "photo",
            title: "Profile photo updated",
            message: `An admin changed your profile photo on ${new Date(p.timestamp).toLocaleDateString()}`,
            timestamp: p.timestamp,
            link: "/teacher/dashboard",
          })),
      ];
      notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      return success(res, { notifications: notifications.slice(0, limit) });
    }

    const studentId = req.user.id;

    const [activeSubs, studentEvents, recentContent, payments] = await Promise.all([
      prisma.subscription.findMany({
        where: {
          studentId,
          ...activeSubscriptionWhere(new Date()),
          teacher: { isActive: true },
        },
        select: {
          teacherId: true,
          teacher: { select: { id: true, name: true } },
        },
      }),
      prisma.logHistory.findMany({
        where: {
          actorId: String(studentId),
          actorType: "STUDENT",
          actionType: { in: ["LOGIN_SUCCESS", "SUBSCRIPTION_CREATED", "SUBSCRIPTION_EXPIRED"] },
        },
        orderBy: { timestamp: "desc" },
        take: 50,
        select: { id: true, actionType: true, targetId: true, timestamp: true, details: true },
      }),
      prisma.logHistory.findMany({
        where: { actionType: "CONTENT_ADDED" },
        orderBy: { timestamp: "desc" },
        take: 60,
        select: { id: true, actionType: true, targetId: true, timestamp: true, details: true },
      }),
      prisma.subscription.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          price: true,
          createdAt: true,
          duration: true,
          teacherId: true,
          teacher: { select: { id: true, name: true } },
        },
      }),
    ]);

    const teacherNameById = {};
    for (const s of activeSubs) {
      if (s && s.teacher) teacherNameById[s.teacher.id] = s.teacher.name;
    }
    for (const p of payments) {
      if (p && p.teacher) teacherNameById[p.teacher.id] = p.teacher.name;
    }
    const activeTeacherIds = new Set(activeSubs.map((s) => s.teacherId));

    const notifications = [];

    for (const a of toAnnouncementItems(announcements)) {
      notifications.push(a);
    }

    for (const e of studentEvents) {
      const details = (e && e.details) || {};
      if (e.actionType === "LOGIN_SUCCESS") {
        notifications.push({
          id: `login-${e.id}`,
          type: "login",
          title: "Welcome back",
          message: details.username ? `Signed in as ${details.username}` : "Signed in successfully",
          timestamp: e.timestamp,
          link: "/profile",
        });
      } else if (e.actionType === "SUBSCRIPTION_CREATED") {
        const teacherName = teacherNameById[details.teacherId] || "your teacher";
        notifications.push({
          id: `subscription-${e.id}`,
          type: "subscription",
          title: "New subscription",
          message: `Subscribed to ${teacherName} · ${DURATION_LABELS[details.duration] || details.duration || "plan"}`,
          timestamp: e.timestamp,
          link: "/my-subscriptions",
        });
      } else if (e.actionType === "SUBSCRIPTION_EXPIRED") {
        const teacherName = teacherNameById[details.teacherId] || "your teacher";
        notifications.push({
          id: `expiry-${e.id}`,
          type: "expiry",
          title: "Subscription expired",
          message: `Subscription to ${teacherName} has expired`,
          timestamp: e.timestamp,
          link: details.teacherId ? `/teachers/${details.teacherId}/subscribe` : "/teachers",
        });
      }
    }

    for (const p of payments) {
      const teacherName = (p.teacher && p.teacher.name) || "your teacher";
      notifications.push({
        id: `payment-${p.id}`,
        type: "payment",
        title: "Payment received",
        message: `Paid ${p.price != null ? p.price.toString() : ""} for ${teacherName}`.trim(),
        timestamp: p.createdAt,
        link: "/my-subscriptions",
      });
    }

    for (const c of recentContent) {
      const details = (c && c.details) || {};
      if (details.contentType !== "LECTURE") continue;
      if (!Number.isInteger(details.teacherId) || !activeTeacherIds.has(details.teacherId)) continue;
      const teacherName = teacherNameById[details.teacherId] || "your teacher";
      notifications.push({
        id: `lecture-${c.id}`,
        type: "lecture",
        title: "New lecture released",
        message: `${details.title || "A new lecture"} · ${teacherName}`,
        timestamp: c.timestamp,
        link: `/content/teacher/${details.teacherId}/lectures/${c.targetId}`,
      });
    }

    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return success(res, { notifications: notifications.slice(0, limit) });
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
