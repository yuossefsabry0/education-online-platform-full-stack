const request = require("supertest");
const bcrypt = require("bcryptjs");
const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const { activateSubscription } = require("../../src/controllers/subscription.controller");

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
  const cookies = res.headers["set-cookie"] || [];
  return cookies.map((c) => String(c).split(";")[0]).join("; ");
}

async function registerStudent(payload) {
  const res = await request(app).post("/api/auth/register").send(payload);
  expect(res.status).toBe(201);
  return res;
}

async function loginCookie(userType, username, password) {
  const res = await request(app).post("/api/auth/login").send({ userType, username, password });
  expect(res.status).toBe(200);
  expectSuccessShape(res);
  expect(res.body.data.token).toBeTruthy();
  expect(res.body.data).not.toHaveProperty("refreshToken");
  const raw = res.headers["set-cookie"] || [];
  expect(raw.join(";")).toContain("refreshToken=");
  expect(raw.join(";")).toMatch(/HttpOnly/i);
  expect(raw.join(";")).toMatch(/SameSite=Lax/i);
  return { token: res.body.data.token, user: res.body.data.user, cookie: cookieOf(res) };
}

const S = {
  adminToken: null,
  adminId: null,
  tMix: null,
  tSoft: null,
  tContent: null,
  tSearch: null,
  tEmpty: null,
  sActive: null,
  sCancelled: null,
  sExpired: null,
  sPast: null,
  sEmpty: null,
  sContent: null,
  priceMix: null,
};

async function makeTeacher(username, name) {
  const res = await request(app)
    .post("/api/admin/teachers")
    .set("Authorization", `Bearer ${S.adminToken}`)
    .send({
      name,
      username,
      email: `${username}@test.dev`,
      password: "teacher123",
      subject: "Math",
      gradeClass: "1st year secondary grade",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
  expect(res.status).toBe(201);
  return res.body.data.teacher;
}

async function makeStudent(username) {
  await registerStudent({
    name: `${username} Name`,
    username,
    email: `${username}@test.dev`,
    password: "student123",
  });
  const data = await loginCookie("student", username, "student123");
  const row = await prisma.student.findUnique({ where: { username }, select: { id: true } });
  return { token: data.token, user: data.user, cookie: data.cookie, id: row.id };
}

beforeAll(async () => {
  await prisma.admin.create({
    data: { username: "t1admin", email: "t1admin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  const adminLogin = await loginCookie("admin", "t1admin", "admin123");
  S.adminToken = adminLogin.token;
  const adminRow = await prisma.admin.findUnique({ where: { username: "t1admin" }, select: { id: true } });
  S.adminId = adminRow.id;

  S.tMix = await makeTeacher("t1_mix_teacher", "T1 Mix Teacher");
  S.tSoft = await makeTeacher("t1_soft_teacher", "T1 Soft Teacher");
  S.tContent = await makeTeacher("t1_content_teacher", "T1 Content Teacher");
  S.tSearch = await makeTeacher("t1_ZqxCaseMiXeD", "T1 Zqx CaseMiXeD Name");
  S.tEmpty = await makeTeacher("t1_empty_teacher", "T1 Empty Teacher");
  S.priceMix = Number(S.tMix.price1Month);

  S.sActive = await makeStudent("t1_s_active");
  S.sCancelled = await makeStudent("t1_s_cancelled");
  S.sExpired = await makeStudent("t1_s_expired");
  S.sPast = await makeStudent("t1_s_past");
  S.sEmpty = await makeStudent("t1_s_empty");
  S.sContent = await makeStudent("t1_s_content");

  const now = new Date();
  const future = new Date(now.getTime() + 30 * 86400000);
  const past = new Date(now.getTime() - 86400000);

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.sActive.token}`)
    .send({ teacherId: S.tMix.id, duration: "ONE_MONTH" })
    .expect(201);

  await prisma.subscription.create({
    data: {
      studentId: S.sCancelled.id,
      teacherId: S.tMix.id,
      teacherRole: `SUB${S.tMix.id}`,
      duration: "ONE_MONTH",
      price: 60,
      startDate: now,
      endDate: future,
      status: "CANCELLED",
    },
  });
  await prisma.subscription.create({
    data: {
      studentId: S.sExpired.id,
      teacherId: S.tMix.id,
      teacherRole: `SUB${S.tMix.id}`,
      duration: "ONE_MONTH",
      price: 60,
      startDate: now,
      endDate: future,
      status: "EXPIRED",
    },
  });
  await prisma.subscription.create({
    data: {
      studentId: S.sPast.id,
      teacherId: S.tMix.id,
      teacherRole: `SUB${S.tMix.id}`,
      duration: "ONE_MONTH",
      price: 60,
      startDate: past,
      endDate: past,
      status: "ACTIVE",
    },
  });

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.sContent.token}`)
    .send({ teacherId: S.tContent.id, duration: "ONE_MONTH" })
    .expect(201);

  const tLogin = await loginCookie("teacher", "t1_content_teacher", "teacher123");
  await request(app)
    .post("/api/teacher/dashboard/content")
    .set("Authorization", `Bearer ${tLogin.token}`)
    .send({ type: "LECTURE", title: "T1 Lecture", body: "Notes", fileUrl: "https://media.example.com/t1.mp4", isPublished: true })
    .expect(201);
}, 60000);

afterAll(async () => {
  const studentUsernames = [
    "t1_s_active", "t1_s_cancelled", "t1_s_expired", "t1_s_past",
    "t1_s_empty", "t1_s_content", "t1_s_auth", "t1_s_conc",
    "t1_enum_student", "t1_shared_name", "t1_soft_student", "t1_mix_student",
  ];
  const teacherUsernames = [
    "t1_mix_teacher", "t1_soft_teacher", "t1_content_teacher",
    "t1_ZqxCaseMiXeD", "t1_empty_teacher", "t1_enum_teacher", "t1_shared_name",
  ];
  const students = await prisma.student.findMany({ where: { username: { in: studentUsernames } }, select: { id: true } });
  const teachers = await prisma.teacher.findMany({ where: { username: { in: teacherUsernames } }, select: { id: true } });
  const sIds = students.map((s) => s.id);
  const tIds = teachers.map((t) => t.id);
  if (sIds.length || tIds.length) {
    await prisma.refreshToken.deleteMany({
      where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] },
    });
    await prisma.subscription.deleteMany({
      where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] },
    });
    await prisma.teacherContent.deleteMany({ where: { teacherId: { in: tIds } } });
  }
  await prisma.student.deleteMany({ where: { username: { in: studentUsernames } } });
  await prisma.teacher.deleteMany({ where: { username: { in: teacherUsernames } } });
  await prisma.refreshToken.deleteMany({ where: { adminId: S.adminId } });
  await prisma.admin.deleteMany({ where: { username: "t1admin" } });
  await prisma.$disconnect();
});

describe("cors allowlist", () => {
  it("serves an allowed configured origin with credentials", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:3000")
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("supports the second documented local origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "http://127.0.0.1:3000")
      .expect(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not reflect a denied origin", async () => {
    const res = await request(app)
      .get("/api/health")
      .set("Origin", "https://evil.example.com")
      .expect(200);
    expect(res.headers["access-control-allow-origin"] || "").not.toContain("evil");
  });

  it("answers preflight for an allowed origin", async () => {
    const res = await request(app)
      .options("/api/health")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .expect(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
  });
});

describe("cookie session and rotation", () => {
  let auth;

  it("logs in through the cookie without a body refresh token", async () => {
    await registerStudent({ name: "T1 Auth", username: "t1_s_auth", email: "t1_s_auth@test.dev", password: "student123" });
    auth = await loginCookie("student", "t1_s_auth", "student123");
  });

  it("restores the session after reload through silent cookie refresh", async () => {
    const res = await request(app).post("/api/auth/refresh").set("Cookie", auth.cookie).send({});
    expect(res.status).toBe(200);
    expectSuccessShape(res);
    expect(res.body.data.token).toBeTruthy();
    auth.cookie = cookieOf(res);
  });

  it("rotates the refresh token and rejects the old value", async () => {
    const oldCookie = auth.cookie;
    const res = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie).send({});
    expect(res.status).toBe(200);
    const nextCookie = cookieOf(res);
    expect(nextCookie).toBeTruthy();
    expect(nextCookie).not.toBe(oldCookie);
    auth.cookie = nextCookie;
    const reuse = await request(app).post("/api/auth/refresh").set("Cookie", oldCookie).send({});
    expectErrorShape(reuse, 401, "REFRESH_TOKEN_REVOKED");
  });

  it("supports repeated refresh along the chain", async () => {
    const first = await request(app).post("/api/auth/refresh").set("Cookie", auth.cookie).send({});
    expect(first.status).toBe(200);
    const second = await request(app).post("/api/auth/refresh").set("Cookie", cookieOf(first)).send({});
    expect(second.status).toBe(200);
    auth.cookie = cookieOf(second);
  });

  it("rejects expired refresh tokens", async () => {
    const row = await prisma.refreshToken.findFirst({
      where: { studentId: auth.user.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
    });
    await prisma.refreshToken.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(app).post("/api/auth/refresh").set("Cookie", auth.cookie).send({});
    expectErrorShape(res, 401, "REFRESH_TOKEN_EXPIRED");
  });

  it("logs out by clearing the cookie and revoking the row", async () => {
    const fresh = await loginCookie("student", "t1_s_auth", "student123");
    const res = await request(app).post("/api/auth/logout").set("Cookie", fresh.cookie).send({});
    expect(res.status).toBe(200);
    expectSuccessShape(res);
    const cleared = (res.headers["set-cookie"] || []).join(";");
    expect(cleared).toMatch(/refreshToken=/);
    expect(cleared).toMatch(/Max-Age=0/);
    const again = await request(app).post("/api/auth/refresh").set("Cookie", fresh.cookie).send({});
    expectErrorShape(again, 401, "REFRESH_TOKEN_REVOKED");
  });

  it("allows exactly one of two concurrent refreshes with the same token", async () => {
    await registerStudent({ name: "T1 Conc", username: "t1_s_conc", email: "t1_s_conc@test.dev", password: "student123" });
    const data = await loginCookie("student", "t1_s_conc", "student123");
    const [a, b] = await Promise.all([
      request(app).post("/api/auth/refresh").set("Cookie", data.cookie).send({}),
      request(app).post("/api/auth/refresh").set("Cookie", data.cookie).send({}),
    ]);
    const ok = [a, b].filter((r) => r.status === 200);
    const denied = [a, b].filter((r) => r.status === 401);
    expect(ok.length).toBe(1);
    expect(denied.length).toBe(1);
  });
});

describe("teacher income and subscribers use the active rule", () => {
  it("counts only the active subscription in income buckets", async () => {
    const tLogin = await loginCookie("teacher", "t1_mix_teacher", "teacher123");
    const res = await request(app)
      .get("/api/teacher/dashboard/income")
      .set("Authorization", `Bearer ${tLogin.token}`)
      .expect(200);
    expectSuccessShape(res);
    expect(Number(res.body.data.income.currentMonth)).toBe(S.priceMix);
    expect(Number(res.body.data.income.last3Months)).toBe(S.priceMix);
    expect(Number(res.body.data.income.year)).toBe(S.priceMix);
  });

  it("lists only the active subscriber", async () => {
    const tLogin = await loginCookie("teacher", "t1_mix_teacher", "teacher123");
    const res = await request(app)
      .get("/api/teacher/dashboard/subscribers")
      .set("Authorization", `Bearer ${tLogin.token}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.totalSubscribers).toBe(1);
    expect(res.body.data.subscribers.length).toBe(1);
    expect(res.body.data.subscribers[0].username).toBe("t1_s_active");
  });

  it("reports zero income for a teacher with no subscriptions", async () => {
    const tLogin = await loginCookie("teacher", "t1_empty_teacher", "teacher123");
    const res = await request(app)
      .get("/api/teacher/dashboard/income")
      .set("Authorization", `Bearer ${tLogin.token}`)
      .expect(200);
    expect(res.body.data.income.currentMonth).toBe(0);
    expect(res.body.data.income.last3Months).toBe(0);
    expect(res.body.data.income.year).toBe(0);
  });
});

describe("subscriptions mine", () => {
  it("returns the active subscription with its teacher sub-object", async () => {
    const res = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${S.sActive.token}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.subscriptions.length).toBe(1);
    const item = res.body.data.subscriptions[0];
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("duration");
    expect(item).toHaveProperty("status", "ACTIVE");
    expect(item.teacher).toMatchObject({ id: S.tMix.id, name: "T1 Mix Teacher" });
    expect(item.teacher).not.toHaveProperty("password");
    expect(JSON.stringify(res.body)).not.toContain("password");
  });

  it("returns an empty array for a student with no subscriptions", async () => {
    const res = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${S.sEmpty.token}`)
      .expect(200);
    expect(res.body.data.subscriptions).toEqual([]);
  });

  it("filters mixed states to the active subscription only", async () => {
    await registerStudent({ name: "T1 Mix", username: "t1_mix_student", email: "t1_mix_student@test.dev", password: "student123" });
    const data = await loginCookie("student", "t1_mix_student", "student123");
    const row = await prisma.student.findUnique({ where: { username: "t1_mix_student" }, select: { id: true } });
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 86400000);
    await prisma.subscription.create({
      data: {
        studentId: row.id, teacherId: S.tMix.id, teacherRole: `SUB${S.tMix.id}`,
        duration: "ONE_MONTH", price: 60, startDate: now, endDate: future, status: "CANCELLED",
      },
    });
    await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${data.token}`)
      .send({ teacherId: S.tContent.id, duration: "ONE_MONTH" })
      .expect(201);
    const res = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${data.token}`)
      .expect(200);
    expect(res.body.data.subscriptions.length).toBe(1);
    expect(res.body.data.subscriptions[0].teacher.id).toBe(S.tContent.id);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await request(app).get("/api/subscriptions/mine");
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });

  it("rejects non-student roles", async () => {
    const tLogin = await loginCookie("teacher", "t1_mix_teacher", "teacher123");
    const tRes = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${tLogin.token}`);
    expectErrorShape(tRes, 403, "FORBIDDEN");
    const aRes = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${S.adminToken}`);
    expectErrorShape(aRes, 403, "FORBIDDEN");
  });

  it("rejects invalid tokens", async () => {
    const res = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", "Bearer invalid.token.here");
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });

  it("excludes soft-deleted teachers while preserving history", async () => {
    await registerStudent({ name: "T1 Soft", username: "t1_soft_student", email: "t1_soft_student@test.dev", password: "student123" });
    const data = await loginCookie("student", "t1_soft_student", "student123");
    const row = await prisma.student.findUnique({ where: { username: "t1_soft_student" }, select: { id: true } });
    await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${data.token}`)
      .send({ teacherId: S.tSoft.id, duration: "ONE_MONTH" })
      .expect(201);
    const before = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${data.token}`)
      .expect(200);
    expect(before.body.data.subscriptions.length).toBe(1);
    await prisma.teacher.update({ where: { id: S.tSoft.id }, data: { isActive: false } });
    const after = await request(app)
      .get("/api/subscriptions/mine")
      .set("Authorization", `Bearer ${data.token}`)
      .expect(200);
    expect(after.body.data.subscriptions).toEqual([]);
    const history = await prisma.subscription.findMany({
      where: { studentId: row.id, teacherId: S.tSoft.id },
    });
    expect(history.length).toBe(1);
  });
});

describe("retained content routes", () => {
  it("serves the teacher content index with its contract", async () => {
    const res = await request(app)
      .get(`/api/teachers/${S.tContent.id}/content`)
      .set("Authorization", `Bearer ${S.sContent.token}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teacherId).toBe(S.tContent.id);
    expect(Array.isArray(res.body.data.content)).toBe(true);
    expect(res.body.data.content.length).toBe(1);
    expect(res.body.data).toHaveProperty("activeRoles");
  });

  it("serves the canonical content page and section", async () => {
    const page = await request(app)
      .get(`/api/content/teacher/${S.tContent.id}`)
      .set("Authorization", `Bearer ${S.sContent.token}`)
      .expect(200);
    expect(page.body.data.teacher.id).toBe(S.tContent.id);
    expect(Array.isArray(page.body.data.sections)).toBe(true);
    const section = await request(app)
      .get(`/api/content/teacher/${S.tContent.id}/lectures`)
      .set("Authorization", `Bearer ${S.sContent.token}`)
      .expect(200);
    expect(section.body.data.section.key).toBe("lectures");
    expect(section.body.data.section.content.length).toBe(1);
  });
});

describe("teacher search case behavior", () => {
  it.each([["T1 ZQX CASEMIXED NAME"], ["t1 zqx casemixed name"], ["t1 ZqX cAsEmIxEd NaMe"]])(
    "finds the mixed-case teacher for query %s",
    async (q) => {
      const res = await request(app).get("/api/teachers/search").query({ q }).expect(200);
      const names = res.body.data.teachers.map((t) => t.name);
      expect(names).toContain("T1 Zqx CaseMiXeD Name");
    }
  );
});

describe("login enumeration", () => {
  it("returns identical responses for unknown users, wrong passwords and inactive teachers", async () => {
    await registerStudent({ name: "T1 Enum", username: "t1_enum_student", email: "t1_enum_student@test.dev", password: "student123" });
    const missing = await request(app)
      .post("/api/auth/login")
      .send({ userType: "student", username: "t1_no_such_user", password: "whatever123" });
    const wrong = await request(app)
      .post("/api/auth/login")
      .send({ userType: "student", username: "t1_enum_student", password: "wrong-password" });
    await prisma.teacher.update({ where: { id: S.tEmpty.id }, data: { isActive: false } });
    const inactive = await request(app)
      .post("/api/auth/login")
      .send({ userType: "teacher", username: "t1_empty_teacher", password: "teacher123" });
    await prisma.teacher.update({ where: { id: S.tEmpty.id }, data: { isActive: true } });
    for (const res of [missing, wrong, inactive]) {
      expectErrorShape(res, 401, "INVALID_CREDENTIALS");
    }
    expect(missing.body.error.message).toBe(wrong.body.error.message);
    expect(wrong.body.error.message).toBe(inactive.body.error.message);
  });

  it("preserves the ambiguous username flow", async () => {
    await registerStudent({ name: "T1 Shared", username: "t1_shared_name", email: "t1_shared@test.dev", password: "shared123" });
    await makeTeacher("t1_shared_name", "T1 Shared Teacher");
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: "t1_shared_name", password: "shared123" });
    expectErrorShape(res, 409, "AMBIGUOUS_USERNAME");
  });
});

describe("error shape consistency", () => {
  it("normalizes duplicate subscription conflicts to the envelope", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${S.sActive.token}`)
      .send({ teacherId: S.tMix.id, duration: "ONE_MONTH" });
    expectErrorShape(res, 409, "ACTIVE_SUBSCRIPTION_EXISTS");
  });

  it("normalizes invalid durations to the envelope", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${S.sEmpty.token}`)
      .send({ teacherId: S.tMix.id, duration: "TWO_WEEKS" });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  it("rejects unsupported durations in the reusable activation logic", async () => {
    await expect(
      activateSubscription({ studentId: S.sEmpty.id, teacherId: S.tMix.id, duration: "FORTNIGHT" })
    ).rejects.toMatchObject({ status: 400, code: "VALIDATION_ERROR" });
  });
});

describe("admin income serialization", () => {
  it("returns a 2-decimal string total", async () => {
    const res = await request(app)
      .get("/api/admin/income")
      .set("Authorization", `Bearer ${S.adminToken}`)
      .expect(200);
    expect(typeof res.body.data.totalIncome).toBe("string");
    expect(res.body.data.totalIncome).toMatch(/^\d+\.\d{2}$/);
  });
});

describe("fileUrl validation", () => {
  it("accepts a supported https url", async () => {
    const tLogin = await loginCookie("teacher", "t1_mix_teacher", "teacher123");
    const res = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${tLogin.token}`)
      .send({ type: "LECTURE", title: "T1 file ok", fileUrl: "https://media.example.com/t1ok.mp4" })
      .expect(201);
    expect(res.body.data.content.fileUrl).toBe("https://media.example.com/t1ok.mp4");
  });

  it.each([
    ["javascript:alert(1)"],
    ["JaVaScRiPt:alert(1)"],
    ["   javascript:alert(1)"],
    ["vbscript:msgbox(1)"],
    ["   VBSCRIPT:msgbox(1)"],
    ["/relative/path.mp4"],
    ["not a url"],
  ])("rejects unsafe fileUrl %s", async (fileUrl) => {
    const tLogin = await loginCookie("teacher", "t1_mix_teacher", "teacher123");
    const res = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${tLogin.token}`)
      .send({ type: "LECTURE", title: "T1 file bad", fileUrl });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });
});
