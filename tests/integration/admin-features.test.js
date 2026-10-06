const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const mailer = require("../../src/utils/mailer");

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
    data: { username: "admfeatadmin", email: "admfeatadmin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  S.adminToken = await loginAs("admin", "admfeatadmin", "admin123");

  const teacherRes = await request(app)
    .post("/api/admin/teachers")
    .set("Authorization", `Bearer ${S.adminToken}`)
    .send({
      name: "AdmFeat Teacher",
      username: "admfeat_teacher",
      email: "admfeatteacher@test.dev",
      password: "teacher123",
      subject: "Physics",
      gradeClass: "1st year secondary grade",
      price1Month: 70,
      price3Months: 189,
      price6Months: 350,
      price1Year: 630,
    });
  expect(teacherRes.status).toBe(201);
  S.teacherId = teacherRes.body.data.teacher.id;
  S.teacherToken = await loginAs("teacher", "admfeat_teacher", "teacher123");

  await request(app).post("/api/auth/register").send({
    name: "AdmFeat Student",
    username: "admfeat_student",
    email: "admfeatstudent@test.dev",
    password: "student123",
  });
  await verifyStudentEmail("admfeatstudent@test.dev");
  S.studentToken = await loginAs("student", "admfeat_student", "student123");
  const row = await prisma.student.findUnique({ where: { username: "admfeat_student" }, select: { id: true } });
  S.studentId = row.id;

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.studentToken}`)
    .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
    .expect(201);

  await request(app)
    .post("/api/teacher/dashboard/content")
    .set("Authorization", `Bearer ${S.teacherToken}`)
    .send({ type: "LECTURE", title: "AdmFeat Lecture 01", body: "notes" })
    .expect(201);
}, 60000);

afterAll(async () => {
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
    select: { id: true },
  });
  const subIds = subs.map((s) => String(s.id));
  if (subIds.length) await prisma.logHistory.deleteMany({ where: { targetId: { in: subIds } } });
  await prisma.logHistory.deleteMany({ where: { actorId: String(S.studentId) } });
  await prisma.logHistory.deleteMany({ where: { targetId: "all" } });
  await prisma.logHistory.deleteMany({ where: { targetId: String(S.teacherId) } });
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.passwordResetToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.emailVerificationToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.subscription.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.teacherContent.deleteMany({ where: { teacherId: S.teacherId } });
  await prisma.student.deleteMany({ where: { id: S.studentId } });
  await prisma.teacher.deleteMany({ where: { id: S.teacherId } });
  await prisma.admin.deleteMany({ where: { username: "admfeatadmin" } });
});

describe("admin broadcast notifications", () => {
  it("sends an announcement visible to students and teachers", async () => {
    const sent = await request(app)
      .post("/api/admin/notifications")
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({ title: "AdmFeat Notice", message: "Hello everyone" })
      .expect(201);
    expectSuccessShape(sent);
    expect(sent.body.data.notification.title).toBe("AdmFeat Notice");

    const studentFeed = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    const studentTypes = studentFeed.body.data.notifications.map((n) => n.type);
    expect(studentTypes).toContain("announcement");
    const ann = studentFeed.body.data.notifications.find((n) => n.type === "announcement");
    expect(ann.title).toBe("AdmFeat Notice");
    expect(Number.isNaN(new Date(ann.timestamp).getTime())).toBe(false);

    const teacherFeed = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .expect(200);
    expect(teacherFeed.body.data.notifications.map((n) => n.type)).toContain("announcement");
  });

  it("rejects empty broadcasts and non-admin senders", async () => {    const empty = await request(app)
      .post("/api/admin/notifications")
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({ title: "", message: "" });
    expectErrorShape(empty, 400, "VALIDATION_ERROR");
    const student = await request(app)
      .post("/api/admin/notifications")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .send({ title: "Hi", message: "Hello" });
    expect(student.status).toBe(403);
  });
});

describe("admin teacher photo edit", () => {
  it("updates the photo, logs history, and notifies the teacher", async () => {
    const photoUrl = "https://picsum.photos/seed/admfeat/640/420";
    const updated = await request(app)
      .put(`/api/admin/teachers/${S.teacherId}`)
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({ photoUrl })
      .expect(200);
    expect(updated.body.data.teacher.photoUrl).toBe(photoUrl);

    const listed = await request(app)
      .get("/api/teachers")
      .set("Authorization", `Bearer ${S.adminToken}`);
    const row = listed.body.data.teachers.find((t) => t.id === S.teacherId);
    expect(row.photoUrl).toBe(photoUrl);

    const historyEntry = await prisma.logHistory.findFirst({
      where: { actionType: "TEACHER_PHOTO_UPDATED", targetId: String(S.teacherId) },
      orderBy: { timestamp: "desc" },
    });
    expect(historyEntry).not.toBeNull();
    expect(historyEntry.details.teacherId).toBe(S.teacherId);

    const teacherFeed = await request(app)
      .get("/api/user/notifications")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .expect(200);
    const photo = teacherFeed.body.data.notifications.find((n) => n.type === "photo");
    expect(photo).toBeTruthy();
    expect(photo.message).toContain("admin");
  });

  it("rejects non-URL photo values", async () => {
    const bad = await request(app)
      .put(`/api/admin/teachers/${S.teacherId}`)
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({ photoUrl: "not-a-url" });
    expectErrorShape(bad, 400, "VALIDATION_ERROR");
  });
});

describe("admin unrestricted content access", () => {
  it("lets admins view teacher content without a subscription", async () => {
    const page = await request(app)
      .get(`/api/content/teacher/${S.teacherId}`)
      .set("Authorization", `Bearer ${S.adminToken}`)
      .expect(200);
    expectSuccessShape(page);
    const section = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .set("Authorization", `Bearer ${S.adminToken}`)
      .expect(200);
    expect(section.body.data.section.content.length).toBeGreaterThan(0);
  });
});
