const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const config = require("../../src/config");

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

const S = { studentToken: null, studentId: null, teacherId: null, teacherToken: null, adminToken: null };

beforeAll(async () => {
  await prisma.admin.create({
    data: { username: "t2admin", email: "t2admin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  const adminLogin = await request(app)
    .post("/api/auth/login")
    .send({ userType: "admin", username: "t2admin", password: "admin123" });
  S.adminToken = adminLogin.body.data.token;

  const teacherRes = await request(app)
    .post("/api/admin/teachers")
    .set("Authorization", `Bearer ${S.adminToken}`)
    .send({
      name: "T2 Me Teacher",
      username: "t2_me_teacher",
      email: "t2me@test.dev",
      password: "teacher123",
      subject: "Math",
      gradeClass: "1st year secondary grade",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
  S.teacherId = teacherRes.body.data.teacher.id;

  await request(app).post("/api/auth/register").send({
    name: "T2 Me Student",
    username: "t2_me_student",
    email: "t2me_student@test.dev",
    password: "student123",
  });
  const studentLogin = await request(app)
    .post("/api/auth/login")
    .send({ userType: "student", username: "t2_me_student", password: "student123" });
  S.studentToken = studentLogin.body.data.token;
  const row = await prisma.student.findUnique({ where: { username: "t2_me_student" }, select: { id: true } });
  S.studentId = row.id;

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.studentToken}`)
    .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
    .expect(201);

  const teacherLogin = await request(app)
    .post("/api/auth/login")
    .send({ userType: "teacher", username: "t2_me_teacher", password: "teacher123" });
  S.teacherToken = teacherLogin.body.data.token;
}, 60000);

afterAll(async () => {
  await prisma.refreshToken.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.subscription.deleteMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
  });
  await prisma.student.deleteMany({ where: { id: S.studentId } });
  await prisma.teacher.deleteMany({ where: { id: S.teacherId } });
  const admin = await prisma.admin.findUnique({ where: { username: "t2admin" }, select: { id: true } });
  if (admin) {
    await prisma.refreshToken.deleteMany({ where: { adminId: admin.id } });
    await prisma.admin.deleteMany({ where: { id: admin.id } });
  }
  await prisma.$disconnect();
});

describe("profile subscription resolution", () => {
  it("keeps activeRoles and adds teacher details", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.activeRoles).toContain(`SUB${S.teacherId}`);
    expect(Array.isArray(res.body.data.teachers)).toBe(true);
    expect(res.body.data.teachers).toHaveLength(1);
    expect(res.body.data.teachers[0]).toMatchObject({ id: S.teacherId, name: "T2 Me Teacher" });
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("returns an empty detail array for non-students", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .expect(200);
    expect(res.body.data.activeRoles).toEqual([]);
    expect(res.body.data.teachers).toEqual([]);
  });

  it("rejects unauthenticated profile requests", async () => {
    const res = await request(app).get("/api/user/me");
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });
});

describe("contact configuration", () => {
  it("serves the configured address through the existing config", async () => {
    const res = await request(app).get("/api/contact").expect(200);
    expectSuccessShape(res);
    expect(res.body.data.message).toContain(config.contact.email);
  });
});

describe("seed-owned update contract", () => {
  it("keeps production hashing rounds and never overwrites passwords on re-seed", async () => {
    expect(config.security.bcryptRounds).toBe(10);
    const before = await prisma.teacher.findUnique({
      where: { id: S.teacherId },
      select: { password: true },
    });
    const updated = await prisma.teacher.upsert({
      where: { username: "t2_me_teacher" },
      update: { name: "T2 Me Teacher", subject: "Math", gradeClass: "1st year secondary grade" },
      create: {
        name: "T2 Me Teacher",
        username: "t2_me_teacher",
        email: "t2me@test.dev",
        password: await bcrypt.hash("teacher123", config.security.bcryptRounds),
        subject: "Math",
        gradeClass: "1st year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      },
      select: { password: true, name: true },
    });
    expect(updated.password).toBe(before.password);
    expect(updated.name).toBe("T2 Me Teacher");
  });
});
