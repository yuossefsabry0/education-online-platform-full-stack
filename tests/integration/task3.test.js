const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const { hashToken } = require("../../src/utils/singleUseToken");
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

function cookieOf(res) {
  return ((res.headers["set-cookie"] || []).map((c) => String(c).split(";")[0]).join("; "));
}

async function registerStudent(username) {
  const res = await request(app).post("/api/auth/register").send({
    name: `${username} Name`,
    username,
    email: `${username}@test.dev`,
    password: "student123",
  });
  expect(res.status).toBe(201);
}

async function loginAs(userType, username, password) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ userType, username, password });
  expect(res.status).toBe(200);
  return { token: res.body.data.token, cookie: cookieOf(res) };
}

const S = {};

beforeAll(async () => {
  mailer.resetMailerForTests();
  await prisma.admin.create({
    data: { username: "t3admin", email: "t3admin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  const adminLogin = await loginAs("admin", "t3admin", "admin123");
  S.adminToken = adminLogin.token;

  const teacherRes = await request(app)
    .post("/api/admin/teachers")
    .set("Authorization", `Bearer ${S.adminToken}`)
    .send({
      name: "T3 Teacher",
      username: "t3_teacher",
      email: "t3teacher@test.dev",
      password: "teacher123",
      subject: "Math",
      gradeClass: "1st year secondary grade",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
  S.teacherId = teacherRes.body.data.teacher.id;

  await registerStudent("t3_pw_student");
  const login = await loginAs("student", "t3_pw_student", "student123");
  S.studentToken = login.token;
  S.studentCookie = login.cookie;
  const row = await prisma.student.findUnique({ where: { username: "t3_pw_student" }, select: { id: true } });
  S.studentId = row.id;

  await registerStudent("t3_cancel_student");
  const cancelLogin = await loginAs("student", "t3_cancel_student", "student123");
  S.cancelToken = cancelLogin.token;
  const cancelRow = await prisma.student.findUnique({ where: { username: "t3_cancel_student" }, select: { id: true } });
  S.cancelStudentId = cancelRow.id;

  await registerStudent("t3_other_student");
  const otherLogin = await loginAs("student", "t3_other_student", "student123");
  S.otherToken = otherLogin.token;
}, 60000);

afterAll(async () => {
  const students = await prisma.student.findMany({
    where: { username: { in: ["t3_pw_student", "t3_cancel_student", "t3_other_student", "t3_verify_student", "t3_cross_a", "t3_cross_b"] } },
    select: { id: true },
  });
  const sIds = students.map((s) => s.id);
  const teachers = await prisma.teacher.findMany({ where: { username: "t3_teacher" }, select: { id: true } });
  const tIds = teachers.map((t) => t.id);
  await prisma.passwordResetToken.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
  await prisma.emailVerificationToken.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
  const subs = await prisma.subscription.findMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] }, select: { id: true } });
  const subIds = subs.map((s) => String(s.id));
  if (subIds.length) await prisma.logHistory.deleteMany({ where: { targetId: { in: subIds } } });
  await prisma.refreshToken.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
  await prisma.subscription.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
  await prisma.student.deleteMany({ where: { id: { in: sIds } } });
  await prisma.teacher.deleteMany({ where: { id: { in: tIds } } });
  const admin = await prisma.admin.findUnique({ where: { username: "t3admin" }, select: { id: true } });
  if (admin) {
    await prisma.refreshToken.deleteMany({ where: { adminId: admin.id } });
    await prisma.admin.deleteMany({ where: { id: admin.id } });
  }
  await prisma.$disconnect();
});

function lastTokenFromOutbox() {
  const box = mailer.getOutbox();
  const text = box[box.length - 1].text;
  return text.match(/: ([a-f0-9]{64})/)[1];
}

describe("password change", () => {
  it("changes with the correct current password and revokes sessions", async () => {
    const staleCookie = S.studentCookie;
    const res = await request(app)
      .put("/api/auth/password")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .set("Cookie", staleCookie)
      .send({ currentPassword: "student123", newPassword: "newpass123" });
    expect(res.status).toBe(200);
    expectSuccessShape(res);
    expect((res.headers["set-cookie"] || []).join(";")).toMatch(/Max-Age=0/);
    const revoked = await request(app).post("/api/auth/refresh").set("Cookie", staleCookie).send({});
    expectErrorShape(revoked, 401, "REFRESH_TOKEN_REVOKED");
    const oldLogin = await request(app)
      .post("/api/auth/login")
      .send({ userType: "student", username: "t3_pw_student", password: "student123" });
    expectErrorShape(oldLogin, 401, "INVALID_CREDENTIALS");
    const fresh = await loginAs("student", "t3_pw_student", "newpass123");
    S.studentToken = fresh.token;
    S.studentCookie = fresh.cookie;
  });

  it("rejects a wrong current password without changing anything", async () => {
    const res = await request(app)
      .put("/api/auth/password")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .send({ currentPassword: "wrong-current", newPassword: "another123" });
    expectErrorShape(res, 401, "INVALID_CURRENT_PASSWORD");
    await loginAs("student", "t3_pw_student", "newpass123");
  });

  it("rejects an invalid new password with 400", async () => {
    const res = await request(app)
      .put("/api/auth/password")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .send({ currentPassword: "newpass123", newPassword: "x" });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  it("rejects unauthenticated change requests", async () => {
    const res = await request(app)
      .put("/api/auth/password")
      .send({ currentPassword: "newpass123", newPassword: "another123" });
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });
});

describe("password recovery", () => {
  it("resets with a fresh token and invalidates sessions", async () => {
    const before = mailer.getOutbox().length;
    const reqRes = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ userType: "student", email: "t3_pw_student@test.dev" });
    expect(reqRes.status).toBe(200);
    expect(mailer.getOutbox().length).toBe(before + 1);
    const raw = lastTokenFromOutbox();
    const target = await loginAs("student", "t3_pw_student", "newpass123");
    const confirm = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: raw, newPassword: "recovered123" });
    expect(confirm.status).toBe(200);
    await loginAs("student", "t3_pw_student", "recovered123");
    const stale = await request(app).post("/api/auth/refresh").set("Cookie", target.cookie).send({});
    expectErrorShape(stale, 401, "REFRESH_TOKEN_REVOKED");
    const relog = await loginAs("student", "t3_pw_student", "recovered123");
    S.studentToken = relog.token;
    S.studentCookie = relog.cookie;
  });

  it("answers unknown emails identically without sending", async () => {
    const before = mailer.getOutbox().length;
    const res = await request(app)
      .post("/api/auth/password-reset/request")
      .send({ userType: "student", email: "t3_nobody@test.dev" });
    expect(res.status).toBe(200);
    expect(res.body.data.message).toContain("If an account exists");
    expect(mailer.getOutbox().length).toBe(before);
  });

  it("rejects invalid and expired tokens", async () => {
    const bad = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: "0".repeat(64), newPassword: "recovered123" });
    expectErrorShape(bad, 401, "INVALID_RESET_TOKEN");
    await request(app)
      .post("/api/auth/password-reset/request")
      .send({ userType: "student", email: "t3_pw_student@test.dev" });
    const raw = lastTokenFromOutbox();
    await prisma.passwordResetToken.update({
      where: { tokenHash: hashToken(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const gone = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: raw, newPassword: "recovered123" });
    expectErrorShape(gone, 401, "INVALID_RESET_TOKEN");
  });

  it("rejects reuse of a token", async () => {
    await request(app)
      .post("/api/auth/password-reset/request")
      .send({ userType: "student", email: "t3_pw_student@test.dev" });
    const raw = lastTokenFromOutbox();
    await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: raw, newPassword: "reused123" })
      .expect(200);
    const again = await request(app)
      .post("/api/auth/password-reset/confirm")
      .send({ token: raw, newPassword: "reused456" });
    expectErrorShape(again, 401, "INVALID_RESET_TOKEN");
    await loginAs("student", "t3_pw_student", "reused123");
    const relog = await loginAs("student", "t3_pw_student", "reused123");
    S.studentToken = relog.token;
    S.studentCookie = relog.cookie;
  });
});

describe("student self-unsubscribe", () => {
  let subId;

  it("cancels an owned ACTIVE subscription preserving history", async () => {
    const created = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${S.cancelToken}`)
      .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
      .expect(201);
    subId = created.body.data.subscription.id;
    const res = await request(app)
      .post(`/api/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${S.cancelToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.subscription.status).toBe("CANCELLED");
    const row = await prisma.subscription.findUnique({ where: { id: subId }, select: { status: true } });
    expect(row.status).toBe("CANCELLED");
  });

  it("rejects a second cancellation with 409", async () => {
    const res = await request(app)
      .post(`/api/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${S.cancelToken}`);
    expectErrorShape(res, 409, "SUBSCRIPTION_NOT_ACTIVE");
  });

  it("rejects other students, teachers and admins on this route", async () => {
    const other = await request(app)
      .post(`/api/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${S.otherToken}`);
    expectErrorShape(other, 403, "FORBIDDEN");
    const teacherLogin = await loginAs("teacher", "t3_teacher", "teacher123");
    const teacher = await request(app)
      .post(`/api/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${teacherLogin.token}`);
    expectErrorShape(teacher, 403, "FORBIDDEN");
    const admin = await request(app)
      .post(`/api/subscriptions/${subId}/cancel`)
      .set("Authorization", `Bearer ${S.adminToken}`);
    expectErrorShape(admin, 403, "FORBIDDEN");
  });

  it("denies content access after cancellation through the existing rule", async () => {
    const page = await request(app)
      .get(`/api/content/teacher/${S.teacherId}`)
      .set("Authorization", `Bearer ${S.cancelToken}`);
    expect([403, 404].includes(page.status)).toBe(true);
    if (page.status === 403) {
      expect(["NO_ACTIVE_SUBSCRIPTION", "SUBSCRIPTION_REQUIRED"]).toContain(page.body.error.code);
    }
  });

  it("rejects cancelling an expired subscription", async () => {
    const created = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${S.otherToken}`)
      .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
      .expect(201);
    const otherSubId = created.body.data.subscription.id;
    await prisma.subscription.update({ where: { id: otherSubId }, data: { status: "EXPIRED" } });
    const res = await request(app)
      .post(`/api/subscriptions/${otherSubId}/cancel`)
      .set("Authorization", `Bearer ${S.otherToken}`);
    expectErrorShape(res, 409, "SUBSCRIPTION_NOT_ACTIVE");
  });
});

describe("email verification", () => {
  it("leaves existing logins working for unverified accounts", async () => {
    await registerStudent("t3_verify_student");
    const row = await prisma.student.findUnique({
      where: { username: "t3_verify_student" },
      select: { emailVerified: true },
    });
    expect(row.emailVerified).toBe(false);
    await loginAs("student", "t3_verify_student", "student123");
  });

  it("verifies with a fresh token", async () => {
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_verify_student@test.dev" })
      .expect(200);
    const raw = lastTokenFromOutbox();
    const res = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: raw })
      .expect(200);
    expectSuccessShape(res);
    const row = await prisma.student.findUnique({
      where: { username: "t3_verify_student" },
      select: { emailVerified: true },
    });
    expect(row.emailVerified).toBe(true);
  });

  it("rejects invalid, expired and reused tokens", async () => {
    const bad = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: "f".repeat(64) });
    expectErrorShape(bad, 401, "INVALID_VERIFICATION_TOKEN");
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_verify_student@test.dev" })
      .expect(200);
    const raw = lastTokenFromOutbox();
    await prisma.emailVerificationToken.update({
      where: { tokenHash: hashToken(raw) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const gone = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: raw });
    expectErrorShape(gone, 401, "INVALID_VERIFICATION_TOKEN");
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_verify_student@test.dev" })
      .expect(200);
    const fresh = lastTokenFromOutbox();
    await request(app).post("/api/auth/verify-email/confirm").send({ token: fresh }).expect(200);
    const reuse = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: fresh });
    expectErrorShape(reuse, 401, "INVALID_VERIFICATION_TOKEN");
  });

  it("invalidates the prior token on resend and succeeds idempotently", async () => {
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_verify_student@test.dev" })
      .expect(200);
    const first = lastTokenFromOutbox();
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_verify_student@test.dev" })
      .expect(200);
    const second = lastTokenFromOutbox();
    expect(second).not.toBe(first);
    const stale = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: first });
    expectErrorShape(stale, 401, "INVALID_VERIFICATION_TOKEN");
    const ok = await request(app)
      .post("/api/auth/verify-email/confirm")
      .send({ token: second })
      .expect(200);
    expectSuccessShape(ok);
  });

  it("applies tokens to their own account only", async () => {
    await registerStudent("t3_cross_a");
    await registerStudent("t3_cross_b");
    await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_cross_a@test.dev" })
      .expect(200);
    const raw = lastTokenFromOutbox();
    await request(app).post("/api/auth/verify-email/confirm").send({ token: raw }).expect(200);
    const a = await prisma.student.findUnique({ where: { username: "t3_cross_a" }, select: { emailVerified: true } });
    const b = await prisma.student.findUnique({ where: { username: "t3_cross_b" }, select: { emailVerified: true } });
    expect(a.emailVerified).toBe(true);
    expect(b.emailVerified).toBe(false);
  });

  it("answers unknown resend emails identically without sending", async () => {
    const before = mailer.getOutbox().length;
    const res = await request(app)
      .post("/api/auth/verify-email/resend")
      .send({ userType: "student", email: "t3_nobody@test.dev" });
    expect(res.status).toBe(200);
    expect(mailer.getOutbox().length).toBe(before);
  });
});
