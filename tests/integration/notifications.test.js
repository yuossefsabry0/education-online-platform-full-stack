const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const mailer = require("../../src/utils/mailer");
const { runExpirationPass } = require("../../src/jobs/expireSubscriptions");

function expectSuccessShape(res) {
  expect(res.body.success).toBe(true);
  expect(res.body.error).toBeNull();
  expect(res.body).toHaveProperty("data");
}

function expectErrorShape(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(res.body.data).toBeNull();
  expect(res.body.error.code).toBe(code);
}

async function loginAs(userType, username, password) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ userType, username, password });
  expect(res.status).toBe(200);
  return res.body.data.token;
}

async function verifyStudentEmail(email) {
  const out = mailer.getOutbox();
  const entry = [...out].reverse().find((e) => e.to === email);
  expect(entry).toBeTruthy();
  const m = entry && entry.text ? String(entry.text).match(/[a-f0-9]{64}/) : null;
  expect(m).not.toBeNull();
  await request(app).post("/api/auth/verify-email/confirm").send({ token: m[0] }).expect(200);
}

const S = {};

beforeAll(async () => {
  mailer.resetMailerForTests();
  await prisma.admin.create({
    data: { username: "notifadmin", email: "notifadmin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  S.adminToken = await loginAs("admin", "notifadmin", "admin123");

  for (const [name, username, email] of [
    ["Notif Teacher One", "notif_teacher1", "notifteacher1@test.dev"],
    ["Notif Teacher Two", "notif_teacher2", "notifteacher2@test.dev"],
  ]) {
    const r = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({
        name,
        username,
        email,
        password: "teacher123",
        subject: "Math",
        gradeClass: "1st year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      });
    expect(r.status).toBe(201);
  }
  const t1 = await prisma.teacher.findUnique({ where: { username: "notif_teacher1" }, select: { id: true } });
  const t2 = await prisma.teacher.findUnique({ where: { username: "notif_teacher2" }, select: { id: true } });
  S.teacherId1 = t1.id;
  S.teacherId2 = t2.id;
  S.teacherToken1 = await loginAs("teacher", "notif_teacher1", "teacher123");

  await request(app).post("/api/auth/register").send({
    name: "Notif Student",
    username: "notif_student",
    email: "notifstudent@test.dev",
    password: "student123",
  });
  await verifyStudentEmail("notifstudent@test.dev");
  S.studentToken = await loginAs("student", "notif_student", "student123");
  const row = await prisma.student.findUnique({ where: { username: "notif_student" }, select: { id: true } });
  S.studentId = row.id;

  // Active subscription -> SUBSCRIPTION_CREATED + payment row.
  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.studentToken}`)
    .send({ teacherId: S.teacherId1, duration: "ONE_MONTH" })
    .expect(201);

  // New lecture from the subscribed teacher -> CONTENT_ADDED (LECTURE).
  await request(app)
    .post("/api/teacher/dashboard/content")
    .set("Authorization", `Bearer ${S.teacherToken1}`)
    .send({ type: "LECTURE", title: "Notif Lecture 01", body: "notes" })
    .expect(201);

  // Expired subscription with a second teacher -> SUBSCRIPTION_EXPIRED.
  const startDate = new Date(Date.now() - 86400000);
  await prisma.subscription.create({
    data: {
      studentId: S.studentId,
      teacherId: S.teacherId2,
      teacherRole: `SUB${S.teacherId2}`,
      duration: "ONE_MONTH",
      price: 60,
      startDate,
      endDate: new Date(startDate.getTime() + 1000),
      status: "ACTIVE",
    },
  });
  await runExpirationPass();
}, 60000);

afterAll(async () => {
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId1 }, { teacherId: S.teacherId2 }] },
    select: { id: true },
  });
  const subIds = subs.map((s) => String(s.id));
  if (subIds.length) await prisma.logHistory.deleteMany({ where: { targetId: { in: subIds } } });
  await prisma.logHistory.deleteMany({ where: { actorId: String(S.studentId) } });
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId1 }, { teacherId: S.teacherId2 }] },
  });
  await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId1 }, { teacherId: S.teacherId2 }] },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId1 }, { teacherId: S.teacherId2 }] },
  });
  await prisma.subscription.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId1 }, { teacherId: S.teacherId2 }] },
  });
  await prisma.teacherContent.deleteMany({ where: { teacherId: { in: [S.teacherId1, S.teacherId2] } } });
  await prisma.student.deleteMany({ where: { id: S.studentId } });
  await prisma.teacher.deleteMany({ where: { id: { in: [S.teacherId1, S.teacherId2] } } });
  await prisma.admin.deleteMany({ where: { username: "notifadmin" } });
});

describe("student notifications feed", () => {
  it("returns all five event kinds with backend timestamps and details", async () => {
    const res = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expectSuccessShape(res);
    const items = res.body.data.notifications;
    expect(Array.isArray(items)).toBe(true);
    const types = items.map((n) => n.type);
    for (const expected of ["login", "subscription", "payment", "expiry", "lecture"]) {
      expect(types).toContain(expected);
    }
    for (const n of items) {
      expect(n).toHaveProperty("id");
      expect(n).toHaveProperty("title");
      expect(n).toHaveProperty("message");
      expect(n).toHaveProperty("timestamp");
      expect(n).toHaveProperty("link");
      expect(Number.isNaN(new Date(n.timestamp).getTime())).toBe(false);
    }
    const lecture = items.find((n) => n.type === "lecture");
    expect(lecture.message).toContain("Notif Lecture 01");
    const payment = items.find((n) => n.type === "payment");
    expect(payment.message).toContain("60");
  });

  it("denies anonymous callers, serves teachers their own feed", async () => {
    const anon = await request(app).get("/api/user/notifications");
    expectErrorShape(anon, 401, "UNAUTHORIZED");
    // Teachers receive announcements and their own admin notices.
    const teacher = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${S.teacherToken1}`)
      .expect(200);
    expectSuccessShape(teacher);
    expect(Array.isArray(teacher.body.data.notifications)).toBe(true);
  });
});
