// ---------------------------------------------------------------------------
// Supertest integration suite covering ALL endpoints of the API against a
// SEPARATE test database (tests/setup/globalSetup.js recreates it before every
// run), so the Task-1 seeded development data never affects these assertions.
//
// Every response must confirm to the Task-1 wrapper:
//   success -> { success: true,  data: <payload>, error: null }
//   failure -> { success: false, data: null,  error: { code, message, details } }
// ---------------------------------------------------------------------------
const request = require("supertest");

const app = require("../../src/app");
const prisma = require("../../src/db/prisma");
const mailer = require("../../src/utils/mailer");
const { seedBaseFixtures } = require("../helpers/fixtures");

// Shared mutable state populated as the file's ordered tests run.
const state = {
  studentToken: null,
  teacherToken: null,
  adminToken: null,
  teacherAId: null,
  teacherBId: null,
  teacherALogin: {
    accessToken: null,
    refreshToken: null,
  },
  student1: {
    accessToken: null,
    refreshToken: null,
    id: null,
  },
  student2: {
    accessToken: null,
    refreshToken: null,
    id: null,
  },
  subscriptionId: null,
  teacherContentId: null,
  adminContentId: null,
  gammaTeacherId: null,
};

// --- helpers ----------------------------------------------------------------

function expectSuccessShape(res) {
  expect(res.body.success).toBe(true);
  expect(res.body.error).toBeNull();
  expect(res.body).toHaveProperty("data");
}

function expectErrorShape(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.body.success).toBe(false);
  expect(res.body.data).toBeNull();
  expect(res.body.error).toHaveProperty("message");
  expect(res.body.error.code).toBe(code);
}

async function registerUser(payload) {
  const res = await request(app).post("/api/auth/register").send(payload);
  expect(res.status).toBe(201);
  expectSuccessShape(res);
  await verifyStudentEmail(payload.email);
  return res;
}

async function verifyStudentEmail(email) {
  const out = mailer.getOutbox();
  const entry = [...out].reverse().find((e) => e.to === email);
  expect(entry).toBeTruthy();
  const m = entry && entry.text ? String(entry.text).match(/[a-f0-9]{64}/) : null;
  expect(m).not.toBeNull();
  await request(app).post("/api/auth/verify-email/confirm").send({ token: m[0] }).expect(200);
}

async function login(userType, username, password) {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ userType, username, password });
  expect(res.status).toBe(200);
  expectSuccessShape(res);
  expect(res.body.data.token).toBeTruthy();
  const cookies = res.headers["set-cookie"] || [];
  const refreshCookie = cookies.map((c) => String(c).split(";")[0]).join("; ");
  expect(refreshCookie).toContain("refreshToken=");
  return { ...res.body.data, refreshCookie, rawCookies: cookies };
}

function cookieHeader(value) {
  if (!value) return {};
  if (Array.isArray(value)) return { Cookie: value.map((c) => String(c).split(";")[0]).join("; ") };
  if (typeof value === "string" && value.includes("=")) return { Cookie: value.split(";")[0] };
  return { Cookie: `refreshToken=${value}` };
}

const testStudent1 = {
  name: "Student One",
  username: "student_one",
  email: "student_one@test.dev",
  password: "student123",
};

const testStudent2 = {
  name: "Student Two",
  username: "student_two",
  email: "student_two@test.dev",
  password: "student123",
};

// A well-formed email of exactly 254 characters (the MySQL VARCHAR(254) limit
// that the Zod schemas now enforce for every account table).
const MAX_LENGTH_EMAIL =
  "a".repeat(30) +
  "@" +
  "b".repeat(63) +
  "." +
  "c".repeat(63) +
  "." +
  "d".repeat(63) +
  "." +
  "e".repeat(31);

const MAX_LENGTH_TITLE = "t".repeat(255);
const MAX_LENGTH_FILE_URL = "https://media.example.com/".padEnd(500, "a");

// --- suite ------------------------------------------------------------------

beforeAll(async () => {
  const { teacherA, teacherB } = await seedBaseFixtures();
  state.teacherAId = teacherA.id;
  state.teacherBId = teacherB.id;
  await registerUser(testStudent1);
  await registerUser(testStudent2);
  const s1 = await login("student", testStudent1.username, testStudent1.password);
  state.student1.accessToken = s1.token;
  state.student1.refreshToken = s1.refreshCookie;
  const s2 = await login("student", testStudent2.username, testStudent2.password);
  state.student2.accessToken = s2.token;
  state.student2.refreshToken = s2.refreshCookie;
  const t = await login("teacher", "alpha_teacher", "teacher123");
  state.teacherALogin.accessToken = t.token;
  state.teacherALogin.refreshToken = t.refreshCookie;
  const a = await login("admin", "admin", "admin123");
  state.adminToken = a.token;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Health", () => {
  it("GET /api/health returns the success wrapper", async () => {
    const res = await request(app).get("/api/health").expect(200);
    expectSuccessShape(res);
    expect(res.body.data.status).toBe("ok");
  });

  it("GET /api/v1 mirrors /api for one release", async () => {
    const legacy = await request(app).get("/api/health").expect(200);
    const versioned = await request(app).get("/api/v1/health").expect(200);
    expectSuccessShape(versioned);
    expect(versioned.body.data.status).toBe(legacy.body.data.status);
    const ready = await request(app).get("/api/v1/ready").expect(200);
    expectSuccessShape(ready);
    expect(ready.body.data.status).toBe("ok");
  });

  it("list endpoints share one pagination envelope with limit max 50", async () => {
    const res = await request(app).get("/api/teachers").query({ limit: 51 });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    const ok = await request(app).get("/api/teachers").query({ limit: 50 }).expect(200);
    expectSuccessShape(ok);
    expect(ok.body.data.pagination.limit).toBe(50);
  });
});

describe("Auth endpoints", () => {
  it("POST /api/auth/register creates a new student", async () => {
    const payload = {
      name: "Student Three",
      username: "student_three",
      email: "student_three@test.dev",
      password: "student123",
    };
    const res = await registerUser(payload);
    expect(res.body.data.user.username).toBe(payload.username);
    expect(res.body.data.user).not.toHaveProperty("password");
    const row = await prisma.student.findUnique({ where: { username: payload.username }, select: { id: true } });
    await prisma.emailVerificationToken.deleteMany({ where: { studentId: row.id } });
    await prisma.student.deleteMany({ where: { id: row.id } });
  });

  it("POST /api/auth/register rejects a duplicate username", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send(testStudent1);
    expectErrorShape(res, 409, "DUPLICATE_FIELD");
    expect(res.body.error.details.field).toBe("username");
  });

  it("POST /api/auth/register rejects invalid payloads with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "", username: "x", email: "not-an-email", password: "1" });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  it("login works with a second student (for refresh/logout)", async () => {
    const data = await login(
      "student",
      testStudent2.username,
      testStudent2.password
    );
    state.student2.accessToken = data.token;
    state.student2.refreshToken = data.refreshCookie;
  });

  it("POST /api/auth/login (student) returns token + refresh cookie", async () => {
    const data = await login(
      "student",
      testStudent1.username,
      testStudent1.password
    );
    state.student1.accessToken = data.token;
    state.student1.refreshToken = data.refreshCookie;
    expect(data.user.userType).toBe("student");
  });

  it("POST /api/auth/login (teacher) returns a teacher token", async () => {
    const data = await login("teacher", "alpha_teacher", "teacher123");
    state.teacherALogin.accessToken = data.token;
    state.teacherALogin.refreshToken = data.refreshCookie;
    expect(data.user.userType).toBe("teacher");
  });

  it("POST /api/auth/login (admin) returns an admin token", async () => {
    const data = await login("admin", "admin", "admin123");
    state.adminToken = data.token;
    expect(data.user.userType).toBe("admin");
  });

  it("POST /api/auth/login with wrong password returns 401", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ userType: "student", username: testStudent1.username, password: "wrong-password" });
    expectErrorShape(res, 401, "INVALID_CREDENTIALS");
  });

  it("POST /api/auth/refresh issues a new access token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set(cookieHeader(state.student2.refreshToken))
      .send({});
    expect(res.status).toBe(200);
    expectSuccessShape(res);
    expect(res.body.data.token).toBeTruthy();
    const cookies = res.headers["set-cookie"] || [];
    expect(cookies.join(";")).toContain("refreshToken=");
    state.student2.refreshToken = cookies.map((c) => String(c).split(";")[0]).join("; ");
  });

  it("POST /api/auth/logout revokes the refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set(cookieHeader(state.student2.refreshToken))
      .send({});
    expect(res.status).toBe(200);
    expectSuccessShape(res);
  });

  it("refresh with a revoked token is rejected", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set(cookieHeader(state.student2.refreshToken))
      .send({});
    expectErrorShape(res, 401, "REFRESH_TOKEN_REVOKED");
  });
});

describe("Contact endpoint", () => {
  it("GET /api/contact returns contact email", async () => {
    const res = await request(app).get("/api/contact").expect(200);
    expectSuccessShape(res);
    expect(res.body.data.message).toContain("test@gmail.com");
  });
});

describe("Public teacher listing & search", () => {
  it("GET /api/teachers lists only active teachers without prices", async () => {
    const res = await request(app).get("/api/teachers").expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teachers.length).toBe(2); // only the fixture teachers
    expect(res.body.data.pagination.total).toBe(2);
    const a = res.body.data.teachers.find((t) => t.id === state.teacherAId);
    expect(a.name).toBe("Alpha Teacher");
    expect(a).not.toHaveProperty("price1Month"); // public view hides prices
  });

  it("GET /api/teachers supports pagination & sorting", async () => {
    const res = await request(app)
      .get("/api/teachers")
      .query({ page: 1, limit: 1, sortBy: "name", sortOrder: "asc" })
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teachers.length).toBe(1);
    expect(res.body.data.teachers[0].name).toBe("Alpha Teacher");
  });

  it("GET /api/teachers/search finds by name", async () => {
    const res = await request(app)
      .get("/api/teachers/search")
      .query({ q: "Alpha" })
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teachers.length).toBe(1);
  });

  it("GET /api/teachers/search fuzzy-matches typos", async () => {
    const res = await request(app)
      .get("/api/teachers/search")
      .query({ q: "alpha teachr" }) // one-letter typo of "Alpha Teacher"
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teachers.length).toBe(1);
    expect(res.body.data.teachers[0].name).toBe("Alpha Teacher");
  });

  it("GET /api/teachers/search returns empty for no match", async () => {
    const res = await request(app)
      .get("/api/teachers/search")
      .query({ q: "zzz-no-such-teacher" })
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teachers).toEqual([]);
  });
});

describe("User profile", () => {
  it("GET /api/user/me returns the student profile and roles", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.user.username).toBe(testStudent1.username);
    expect(Array.isArray(res.body.data.activeRoles)).toBe(true);
    state.student1.id = res.body.data.user.id;
  });

  it("GET /api/user/me without a token returns 401", async () => {
    const res = await request(app).get("/api/user/me");
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });
});

describe("Subscriptions & content access", () => {
  it("GET /api/subscriptions/teacher/:id shows plans for a student", async () => {
    const res = await request(app)
      .get(`/api/subscriptions/teacher/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.plans.length).toBe(4);
    expect(res.body.data.hasActiveSubscription).toBe(false);
  });

  it("subscriptions are student-only (teacher gets 403)", async () => {
    const res = await request(app)
      .get(`/api/subscriptions/teacher/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`);
    expectErrorShape(res, 403, "FORBIDDEN");
  });

  it("POST /api/subscriptions/confirm-payment activates a subscription", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .send({ teacherId: state.teacherAId, duration: "ONE_MONTH" })
      .expect(201);
    expectSuccessShape(res);
    expect(res.body.data.subscription.teacherRole).toBe(`SUB${state.teacherAId}`);
    expect(Number(res.body.data.subscription.price)).toBe(60);
    state.subscriptionId = res.body.data.subscription.id;
  });

  it("a duplicate active subscription is rejected with 409", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .send({ teacherId: state.teacherAId, duration: "ONE_YEAR" });
    expectErrorShape(res, 409, "ACTIVE_SUBSCRIPTION_EXISTS");
  });

  it("confirm-payment rejects invalid body (400)", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .send({ teacherId: state.teacherAId, duration: "NOT_A_DURATION" });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  describe("payment webhook", () => {
    const wh = { teacherId: null, gatewayTeacherId: null, studentToken: null, studentId: null, gatewayToken: null, gatewayStudentId: null };

    async function verifyStudentEmail(email) {
      const out = mailer.getOutbox();
      const entry = [...out].reverse().find((e) => e.to === email);
      const m = entry && entry.text ? String(entry.text).match(/[a-f0-9]{64}/) : null;
      if (!m) return;
      await request(app).post("/api/auth/verify-email/confirm").send({ token: m[0] }).expect(200);
    }

    it("sets up webhook fixtures", async () => {
      const t = await request(app)
        .post("/api/admin/teachers")
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send({
          name: "Webhook Teacher", username: "webhook_teacher", email: "webhook_teacher@test.dev",
          password: "teacher123", subject: "Math", gradeClass: "G1",
          price1Month: 60, price3Months: 162, price6Months: 300, price1Year: 540,
        })
        .expect(201);
      wh.teacherId = t.body.data.teacher.id;
      const g = await request(app)
        .post("/api/admin/teachers")
        .set("Authorization", `Bearer ${state.adminToken}`)
        .send({
          name: "Gateway Teacher", username: "gateway_teacher", email: "gateway_teacher@test.dev",
          password: "teacher123", subject: "Math", gradeClass: "G1",
          price1Month: 60, price3Months: 162, price6Months: 300, price1Year: 540,
        })
        .expect(201);
      wh.gatewayTeacherId = g.body.data.teacher.id;
      await registerUser({ name: "WH Student", username: "webhook_student", email: "webhook_student@test.dev", password: "student123" });
      const s = await login("student", "webhook_student", "student123");
      wh.studentToken = s.token;
      wh.studentId = s.user.id;
      await registerUser({ name: "GW Student", username: "gateway_student", email: "gateway_student@test.dev", password: "student123" });
      const gs = await login("student", "gateway_student", "student123");
      wh.gatewayToken = gs.token;
      wh.gatewayStudentId = gs.user.id;
    });

    it("POST /api/subscriptions/webhook activates a subscription", async () => {
      const res = await request(app)
        .post("/api/subscriptions/webhook")
        .set("Authorization", `Bearer ${wh.studentToken}`)
        .send({ teacherId: wh.teacherId, duration: "ONE_MONTH" })
        .expect(201);
      expectSuccessShape(res);
      expect(res.body.data.subscription.teacherRole).toBe(`SUB${wh.teacherId}`);
    });

    it("a duplicate webhook activation is rejected with 409", async () => {
      const res = await request(app)
        .post("/api/subscriptions/webhook")
        .set("Authorization", `Bearer ${wh.studentToken}`)
        .send({ teacherId: wh.teacherId, duration: "ONE_YEAR" });
      expectErrorShape(res, 409, "ACTIVE_SUBSCRIPTION_EXISTS");
    });

    it("webhook rejects invalid body (400)", async () => {
      const res = await request(app)
        .post("/api/subscriptions/webhook")
        .set("Authorization", `Bearer ${wh.studentToken}`)
        .send({ teacherId: wh.teacherId, duration: "NOPE" });
      expectErrorShape(res, 400, "VALIDATION_ERROR");
    });

    it("gateway mode returns intent without creating, webhook enforces signature", async () => {
      const prevProvider = process.env.PAYMENT_PROVIDER;
      const prevSecret = process.env.PAYMENT_WEBHOOK_SECRET;
      process.env.PAYMENT_PROVIDER = "gateway";
      process.env.PAYMENT_WEBHOOK_SECRET = "t20secret";
      try {
        const intent = await request(app)
          .post("/api/subscriptions/confirm-payment")
          .set("Authorization", `Bearer ${wh.gatewayToken}`)
          .send({ teacherId: wh.gatewayTeacherId, duration: "ONE_MONTH" })
          .expect(202);
        expectSuccessShape(intent);
        expect(intent.body.data.intent.provider).toBe("gateway");
        expect(Number(intent.body.data.intent.price)).toBe(60);
        const plans = await request(app)
          .get(`/api/subscriptions/teacher/${wh.gatewayTeacherId}`)
          .set("Authorization", `Bearer ${wh.gatewayToken}`)
          .expect(200);
        expect(plans.body.data.hasActiveSubscription).toBe(false);
        const noSig = await request(app)
          .post("/api/subscriptions/webhook")
          .set("Authorization", `Bearer ${wh.gatewayToken}`)
          .send({ teacherId: wh.gatewayTeacherId, duration: "ONE_MONTH" });
        expectErrorShape(noSig, 401, "INVALID_WEBHOOK_SIGNATURE");
        const badSig = await request(app)
          .post("/api/subscriptions/webhook")
          .set("Authorization", `Bearer ${wh.gatewayToken}`)
          .set("x-payment-signature", "wrong")
          .send({ teacherId: wh.gatewayTeacherId, duration: "ONE_MONTH" });
        expectErrorShape(badSig, 401, "INVALID_WEBHOOK_SIGNATURE");
        const ok = await request(app)
          .post("/api/subscriptions/webhook")
          .set("Authorization", `Bearer ${wh.gatewayToken}`)
          .set("x-payment-signature", "t20secret")
          .send({ teacherId: wh.gatewayTeacherId, duration: "ONE_MONTH" })
          .expect(201);
        expectSuccessShape(ok);
        expect(ok.body.data.subscription.teacherRole).toBe(`SUB${wh.gatewayTeacherId}`);
      } finally {
        if (prevProvider === undefined) delete process.env.PAYMENT_PROVIDER;
        else process.env.PAYMENT_PROVIDER = prevProvider;
        if (prevSecret === undefined) delete process.env.PAYMENT_WEBHOOK_SECRET;
        else process.env.PAYMENT_WEBHOOK_SECRET = prevSecret;
      }
    });

    it("cleans up webhook fixtures", async () => {
      const sIds = [wh.studentId, wh.gatewayStudentId].filter(Boolean);
      const tIds = [wh.teacherId, wh.gatewayTeacherId].filter(Boolean);
      if (sIds.length || tIds.length) {
        await prisma.refreshToken.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
        await prisma.subscription.deleteMany({ where: { OR: [{ studentId: { in: sIds } }, { teacherId: { in: tIds } }] } });
        await prisma.teacherContent.deleteMany({ where: { teacherId: { in: tIds } } });
      }
      if (sIds.length) await prisma.student.deleteMany({ where: { id: { in: sIds } } });
      if (tIds.length) await prisma.teacher.deleteMany({ where: { id: { in: tIds } } });
    });
  });

  describe("email verification gate", () => {
    it("register auto-sends a verification token", async () => {
      await registerUser({ name: "Gate Student", username: "gate_student", email: "gate_student@test.dev", password: "student123" });
      const out = mailer.getOutbox();
      const entry = [...out].reverse().find((e) => e.to === "gate_student@test.dev");
      expect(entry).toBeTruthy();
      const row = await prisma.student.findUnique({ where: { username: "gate_student" }, select: { id: true } });
      await prisma.refreshToken.deleteMany({ where: { studentId: row.id } });
      await prisma.subscription.deleteMany({ where: { studentId: row.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { studentId: row.id } });
      await prisma.student.deleteMany({ where: { id: row.id } });
    });

    it("unverified students cannot subscribe", async () => {
      await request(app).post("/api/auth/register").send({
        name: "Raw Student", username: "raw_student", email: "raw_student@test.dev", password: "student123",
      });
      const data = await login("student", "raw_student", "student123");
      const denied = await request(app)
        .post("/api/subscriptions/confirm-payment")
        .set("Authorization", `Bearer ${data.token}`)
        .send({ teacherId: state.teacherBId, duration: "ONE_MONTH" });
      expectErrorShape(denied, 403, "EMAIL_NOT_VERIFIED");
      const hook = await request(app)
        .post("/api/subscriptions/webhook")
        .set("Authorization", `Bearer ${data.token}`)
        .send({ teacherId: state.teacherBId, duration: "ONE_MONTH" });
      expectErrorShape(hook, 403, "EMAIL_NOT_VERIFIED");
      const row = await prisma.student.findUnique({ where: { username: "raw_student" }, select: { id: true } });
      await prisma.refreshToken.deleteMany({ where: { studentId: row.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { studentId: row.id } });
      await prisma.student.deleteMany({ where: { id: row.id } });
    });
  });

  it("content page is accessible with an active subscription", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.roleRequired).toBe(`SUB${state.teacherAId}`);
    expect(res.body.data.activeRoles).toContain(`SUB${state.teacherAId}`);
  });

  it("loading a teacher's content without subscription is denied", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherBId}`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(res, 403, "SUBSCRIPTION_REQUIRED");
  });

  it("content sections are served for a subscribed teacher", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}/lectures`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.section.key).toBe("lectures");
  });

  it("unknown content sections return 404", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}/not-a-section`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(res, 404, "SECTION_NOT_FOUND");
  });

  it("no active subscription blocks content with an empty-roles message", async () => {
    // student2 holds no subscriptions at all
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.student2.accessToken}`);
    expectErrorShape(res, 403, "NO_ACTIVE_SUBSCRIPTION");
  });

  it("GET /api/teachers/:id/content lists published content with subscription", async () => {
    const res = await request(app)
      .get(`/api/teachers/${state.teacherAId}/content`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teacherId).toBe(state.teacherAId);
  });
});

describe("Teacher dashboard", () => {
  it("GET /api/teacher/dashboard shows the teacher overview", async () => {
    const res = await request(app)
      .get("/api/teacher/dashboard")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teacher.name).toBe("Alpha Teacher");
    expect(res.body.data.actions.subscribers).toBe(
      "/api/teacher/dashboard/subscribers"
    );
  });

  it("teacher dashboard routes reject student tokens", async () => {
    const res = await request(app)
      .get("/api/teacher/dashboard")
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(res, 403, "FORBIDDEN");
  });

  it("GET /api/teacher/dashboard/subscribers lists paying students", async () => {
    const res = await request(app)
      .get("/api/teacher/dashboard/subscribers")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.totalSubscribers).toBe(1);
    expect(res.body.data.subscribers[0].username).toBe(testStudent1.username);
  });

  it("GET /api/teacher/dashboard/income reflects the subscription price", async () => {
    const res = await request(app)
      .get("/api/teacher/dashboard/income")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.income.currentMonth).toBe(60);
  });

  it("POST /api/teacher/dashboard/content adds content", async () => {
    const res = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .send({
        type: "LECTURE",
        title: "Algebra intro",
        body: "Notes here",
        isPublished: true,
      })
      .expect(201);
    expectSuccessShape(res);
    state.teacherContentId = res.body.data.content.id;
  });

  it("PUT /api/teacher/dashboard/content/:id edits own content", async () => {
    const res = await request(app)
      .put(`/api/teacher/dashboard/content/${state.teacherContentId}`)
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .send({ title: "Algebra intro (updated)" })
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.content.title).toBe("Algebra intro (updated)");
  });

  it("student reads real database content after teacher adds/edits it", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}/lectures`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.section.key).toBe("lectures");

    const { content } = res.body.data.section;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBe(1);

    const item = content[0];
    expect(item.title).toBe("Algebra intro (updated)");
    expect(item.body).toBe("Notes here");
    expect(item.type).toBe("LECTURE");
    expect(item).toHaveProperty("createdAt");
    expect(item).not.toHaveProperty("text");
  });

  it("student sees empty array for a section with no content", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}/homework`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.section.key).toBe("homework");
    expect(res.body.data.section.content).toEqual([]);
  });

  it("student content and teacher-listing content share the same source", async () => {
    const sectionRes = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}/lectures`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);

    const listingRes = await request(app)
      .get(`/api/teachers/${state.teacherAId}/content`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`)
      .expect(200);

    const sectionTitles = sectionRes.body.data.section.content.map(
      (c) => c.title
    );
    const listingTitles = listingRes.body.data.content
      .filter((c) => c.type === "LECTURE")
      .map((c) => c.title);

    expect(sectionTitles).toEqual(listingTitles);
    expect(sectionTitles).toContain("Algebra intro (updated)");
  });

  it("a teacher cannot edit another teacher's content", async () => {
    // beta teacher tries to edit alpha teacher's content
    const betaLogin = await login("teacher", "beta_teacher", "teacher123");
    const res = await request(app)
      .put(`/api/teacher/dashboard/content/${state.teacherContentId}`)
      .set("Authorization", `Bearer ${betaLogin.token}`)
      .send({ title: "I don't own this" });
    expectErrorShape(res, 403, "FORBIDDEN");
  });

  it("DELETE /api/teacher/dashboard/content/:id deletes own content", async () => {
    const res = await request(app)
      .delete(`/api/teacher/dashboard/content/${state.teacherContentId}`)
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .expect(200);
    expectSuccessShape(res);
  });
});

describe("Admin routes", () => {
  it("GET /api/admin/subscribers lists all subscribers", async () => {
    const res = await request(app)
      .get("/api/admin/subscribers")
      .query({ page: 1, limit: 10 })
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.subscribers.length).toBe(1);
    expect(res.body.data.subscribers[0].teacherRole).toBe(
      `SUB${state.teacherAId}`
    );
  });

  it("GET /api/admin/teachers/:id/subscribers filters per teacher", async () => {
    const res = await request(app)
      .get(`/api/admin/teachers/${state.teacherAId}/subscribers`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.totalSubscribers).toBe(1);
  });

  it("GET /api/admin/income sums subscription income", async () => {
    const res = await request(app)
      .get("/api/admin/income")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(Number(res.body.data.totalIncome)).toBe(60);
  });

  it("GET /api/admin/teachers/:id returns the full teacher", async () => {
    const res = await request(app)
      .get(`/api/admin/teachers/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(Number(res.body.data.teacher.price1Month)).toBe(60);
    expect(res.body.data.role).toBe(`SUB${state.teacherAId}`);
  });

  it("POST /api/admin/teachers adds a teacher without touching a role list", async () => {
    const res = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Gamma Teacher",
        username: "gamma_teacher",
        email: "gamma@test.dev",
        password: "teacher123",
        subject: "Science",
        gradeClass: "3rd year secondary grade",
        price1Month: 80,
        price3Months: 216,
        price6Months: 400,
        price1Year: 720,
      })
      .expect(201);
    expectSuccessShape(res);
    state.gammaTeacherId = res.body.data.teacher.id;

    // The brand-new teacher can immediately log in and use the teacher role.
    const gammaLogin = await login("teacher", "gamma_teacher", "teacher123");
    expect(gammaLogin.user.userType).toBe("teacher");
    const dash = await request(app)
      .get("/api/teacher/dashboard")
      .set("Authorization", `Bearer ${gammaLogin.token}`)
      .expect(200);
    expectSuccessShape(dash);
    expect(dash.body.data.teacher.name).toBe("Gamma Teacher");
  });

  it("POST /api/admin/teachers rejects duplicate usernames", async () => {
    const res = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Dup Teacher",
        username: "gamma_teacher", // duplicate
        email: "gamma2@test.dev",
        password: "teacher123",
        subject: "Science",
        gradeClass: "3rd year secondary grade",
        price1Month: 80,
        price3Months: 216,
        price6Months: 400,
        price1Year: 720,
      });
    expectErrorShape(res, 409, "DUPLICATE_FIELD");
  });

  it("PUT /api/admin/teachers/:id updates prices with no code change", async () => {
    const res = await request(app)
      .put(`/api/admin/teachers/${state.gammaTeacherId}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ price1Month: 90 })
      .expect(200);
    expectSuccessShape(res);
    expect(Number(res.body.data.teacher.price1Month)).toBe(90);
  });

  it("deleting a teacher with active subscribers is blocked with 409", async () => {
    const res = await request(app)
      .delete(`/api/admin/teachers/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.adminToken}`);
    expectErrorShape(res, 409, "ACTIVE_SUBSCRIPTIONS_EXIST");
  });

  it("POST /api/admin/teachers/:id/content adds content on behalf of a teacher", async () => {
    const res = await request(app)
      .post(`/api/admin/teachers/${state.teacherBId}/content`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ type: "HOMEWORK", title: "HW One", body: "Solve it" })
      .expect(201);
    expectSuccessShape(res);
    state.adminContentId = res.body.data.content.id;
  });

  it("PUT /api/admin/teachers/:id/content/:contentId edits content", async () => {
    const res = await request(app)
      .put(`/api/admin/teachers/${state.teacherBId}/content/${state.adminContentId}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ title: "HW One (published)" })
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.content.title).toBe("HW One (published)");
  });

  it("DELETE /api/admin/teachers/:id/content/:contentId deletes content", async () => {
    const res = await request(app)
      .delete(
        `/api/admin/teachers/${state.teacherBId}/content/${state.adminContentId}`
      )
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
  });

  it("GET /api/admin/logs returns the in-app log history", async () => {
    const res = await request(app)
      .get("/api/admin/logs")
      .query({ sortBy: "timestamp", sortOrder: "desc", limit: 50 })
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.logs.length).toBeGreaterThan(0);
    const actions = res.body.data.logs.map((l) => l.actionType);
    expect(actions).toContain("SUBSCRIPTION_CREATED");
  });

  it("POST /api/admin/subscriptions/:id/cancel revokes access immediately", async () => {
    const res = await request(app)
      .post(`/api/admin/subscriptions/${state.subscriptionId}/cancel`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.subscription.status).toBe("CANCELLED");

    // Access to the teacher's content is now revoked for the student: the
    // student has no other active subscriptions, so the empty-roles guard
    // returns NO_ACTIVE_SUBSCRIPTION.
    const denied = await request(app)
      .get(`/api/content/teacher/${state.teacherAId}`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(denied, 403, "NO_ACTIVE_SUBSCRIPTION");
  });

  it("cancelling an already-cancelled subscription returns 409", async () => {
    const res = await request(app)
      .post(`/api/admin/subscriptions/${state.subscriptionId}/cancel`)
      .set("Authorization", `Bearer ${state.adminToken}`);
    expectErrorShape(res, 409, "SUBSCRIPTION_NOT_ACTIVE");
  });

  it("DELETE /api/admin/teachers/:id soft-deletes a teacher without active subs", async () => {
    const res = await request(app)
      .delete(`/api/admin/teachers/${state.gammaTeacherId}`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.teacher.isActive).toBe(false);

    // Soft-deleted teacher disappears from the public listing.
    const list = await request(app).get("/api/teachers").expect(200);
    const ids = list.body.data.teachers.map((t) => t.id);
    expect(ids).not.toContain(state.gammaTeacherId);
  });
});

describe("Access control & errors", () => {
  it("admin routes reject student tokens with 403", async () => {
    const res = await request(app)
      .get("/api/admin/subscribers")
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(res, 403, "FORBIDDEN");
  });

  it("protected routes reject anonymous requests with 401", async () => {
    const res = await request(app)
      .get("/api/content/teacher/1")
      .set("Authorization", "Bearer not-a-jwt");
    expectErrorShape(res, 401, "UNAUTHORIZED");
  });

  it("invalid teacher ids produce 400", async () => {
    // Plan-listing routes parse the id before any subscription check, so an
    // invalid id is rejected by validation rather than authorization.
    const res = await request(app)
      .get(`/api/subscriptions/teacher/abc`)
      .set("Authorization", `Bearer ${state.student1.accessToken}`);
    expectErrorShape(res, 400, "VALIDATION_ERROR");
  });

  it("unknown routes return 404 with the error wrapper", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expectErrorShape(res, 404, "NOT_FOUND");
  });

  it("malformed JSON body returns 400 INVALID_JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .set("Content-Type", "application/json")
      .send('{"username": "broken"');
    expectErrorShape(res, 400, "INVALID_JSON");
  });

  it("admin can list teachers with full data (prices visible)", async () => {
    const res = await request(app)
      .get("/api/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.fullData).toBe(true);
    expect(res.body.data.teachers[0]).toHaveProperty("price1Month");
  });
});

describe("Soft-deleted teacher content access (Fix Task 2)", () => {
  // Fix Task 2: a soft-deleted (isActive=false) teacher's content must never be
  // served. This mirrors the showContentPage guard on the section routes
  // (showSection), using its own dedicated teacher/student so it stays isolated
  // from the ordered state used elsewhere in the suite.
  let deltaStudentToken = null;
  let deltaTeacherId = null;

  it("sets up a subscribed teacher for the soft-delete scenario", async () => {
    await registerUser({
      name: "Delta Student",
      username: "delta_student",
      email: "delta_student@test.dev",
      password: "student123",
    });
    const loginRes = await login("student", "delta_student", "student123");
    deltaStudentToken = loginRes.token;

    const teacherRes = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Delta Teacher",
        username: "delta_teacher",
        email: "delta@test.dev",
        password: "teacher123",
        subject: "Physics",
        gradeClass: "2nd year secondary grade",
        price1Month: 70,
        price3Months: 189,
        price6Months: 350,
        price1Year: 630,
      })
      .expect(201);
    deltaTeacherId = teacherRes.body.data.teacher.id;

    await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${deltaStudentToken}`)
      .send({ teacherId: deltaTeacherId, duration: "ONE_MONTH" })
      .expect(201);
  });

  it("an active teacher's content page and sections are served", async () => {
    const page = await request(app)
      .get(`/api/content/teacher/${deltaTeacherId}`)
      .set("Authorization", `Bearer ${deltaStudentToken}`)
      .expect(200);
    expectSuccessShape(page);

    const section = await request(app)
      .get(`/api/content/teacher/${deltaTeacherId}/lectures`)
      .set("Authorization", `Bearer ${deltaStudentToken}`)
      .expect(200);
    expectSuccessShape(section);
    expect(section.body.data.section.key).toBe("lectures");
  });

  it("soft-deleted teacher: section returns the same 404 as the content page", async () => {
    // Simulate the teacher being soft-deleted (isActive=false), exactly as the
    // admin soft-delete does. The subscription stays active so the request
    // passes the coverage middleware and reaches the controller's guard.
    await prisma.teacher.update({
      where: { id: deltaTeacherId },
      data: { isActive: false },
    });

    // Content page route: 404 TEACHER_NOT_FOUND.
    await request(app)
      .get(`/api/content/teacher/${deltaTeacherId}`)
      .set("Authorization", `Bearer ${deltaStudentToken}`)
      .expect(404)
      .then((res) => expectErrorShape(res, 404, "TEACHER_NOT_FOUND"));

    // Section route must behave identically (Fix Task 2).
    await request(app)
      .get(`/api/content/teacher/${deltaTeacherId}/lectures`)
      .set("Authorization", `Bearer ${deltaStudentToken}`)
      .expect(404)
      .then((res) => expectErrorShape(res, 404, "TEACHER_NOT_FOUND"));
  });
});

describe("Soft-deleted teacher auth & content access (Fix Task 3)", () => {
  // Fix Task 3: a soft-deleted (isActive=false) teacher must be blocked from
  // logging in, from refreshing tokens, and from editing/deleting content.
  // Uses its own dedicated teacher/student so it stays isolated from the
  // ordered state used elsewhere in the suite.
  let epsilonTeacherId = null;
  let epsilonRefreshToken = null;
  let epsilonAccessToken = null;
  let retainedContentId = null;

  it("an active teacher can log in and obtain tokens (d)", async () => {
    const teacherRes = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Epsilon Teacher",
        username: "epsilon_teacher",
        email: "epsilon@test.dev",
        password: "teacher123",
        subject: "Chemistry",
        gradeClass: "1st year preparatory grade",
        price1Month: 75,
        price3Months: 202,
        price6Months: 375,
        price1Year: 675,
      })
      .expect(201);
    epsilonTeacherId = teacherRes.body.data.teacher.id;

    // Login still works for an active teacher (the refresh-token JWT is
    // deterministic for the same second, so we log in only once).
    const loginData = await login("teacher", "epsilon_teacher", "teacher123");
    epsilonAccessToken = loginData.token;
    epsilonRefreshToken = loginData.refreshCookie;
    expect(loginData.user.userType).toBe("teacher");
  });

  it("an active teacher can still refresh and manage content (d)", async () => {
    const refreshRes = await request(app)
      .post("/api/auth/refresh")
      .set(cookieHeader(epsilonRefreshToken))
      .send({})
      .expect(200);
    expectSuccessShape(refreshRes);
    expect(refreshRes.body.data.token).toBeTruthy();
    const rotated = refreshRes.headers["set-cookie"] || [];
    epsilonRefreshToken = rotated.map((c) => String(c).split(";")[0]).join("; ");

    // Active teacher can add, edit, and delete their own content.
    const toDelete = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${epsilonAccessToken}`)
      .send({
        type: "LECTURE",
        title: "Epsilon editable",
        body: "Notes",
        isPublished: true,
      })
      .expect(201);
    const toDeleteId = toDelete.body.data.content.id;

    await request(app)
      .put(`/api/teacher/dashboard/content/${toDeleteId}`)
      .set("Authorization", `Bearer ${epsilonAccessToken}`)
      .send({ title: "Epsilon editable (updated)" })
      .expect(200);

    await request(app)
      .delete(`/api/teacher/dashboard/content/${toDeleteId}`)
      .set("Authorization", `Bearer ${epsilonAccessToken}`)
      .expect(200);

    // Retain one piece of content for the soft-delete scenarios below.
    const retained = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${epsilonAccessToken}`)
      .send({
        type: "LECTURE",
        title: "Epsilon retained",
        body: "Keep me",
        isPublished: true,
      })
      .expect(201);
    retainedContentId = retained.body.data.content.id;
  });

  it("soft-deletes the teacher for the negative scenarios", async () => {
    await prisma.teacher.update({
      where: { id: epsilonTeacherId },
      data: { isActive: false },
    });
  });

  it("a soft-deleted teacher cannot log in (a)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ userType: "teacher", username: "epsilon_teacher", password: "teacher123" });
    expectErrorShape(res, 401, "INVALID_CREDENTIALS");
  });

  it("a soft-deleted teacher's refresh token is rejected and revoked (b)", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set(cookieHeader(epsilonRefreshToken))
      .send({});
    expectErrorShape(res, 404, "TEACHER_NOT_FOUND");

    const again = await request(app)
      .post("/api/auth/refresh")
      .set(cookieHeader(epsilonRefreshToken))
      .send({});
    expectErrorShape(again, 401, "REFRESH_TOKEN_REVOKED");
  });

  it("a soft-deleted teacher cannot edit or delete content (c)", async () => {
    const editRes = await request(app)
      .put(`/api/teacher/dashboard/content/${retainedContentId}`)
      .set("Authorization", `Bearer ${epsilonAccessToken}`)
      .send({ title: "nope" });
    expectErrorShape(editRes, 404, "TEACHER_NOT_FOUND");

    const deleteRes = await request(app)
      .delete(`/api/teacher/dashboard/content/${retainedContentId}`)
      .set("Authorization", `Bearer ${epsilonAccessToken}`);
    expectErrorShape(deleteRes, 404, "TEACHER_NOT_FOUND");
  });
});

describe("Validation-limit alignment with DB columns (Fix Task 4)", () => {
  // Fix Task 4: the Zod schemas and the MySQL columns must agree, so values at
  // the Zod limits survive all the way to the database, while values past the
  // limit are rejected by Zod (400 VALIDATION_ERROR) and never reach the DB
  // (previously they hit a confusing MySQL "data too long" error).

  it("registers a student with a 254-char email end-to-end", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Long Email Student",
        username: "long_email_student",
        email: MAX_LENGTH_EMAIL,
        password: "student123",
      })
      .expect(201);
    expectSuccessShape(res);
    expect(res.body.data.user.email).toBe(MAX_LENGTH_EMAIL);

    const stored = await prisma.student.findUnique({
      where: { email: MAX_LENGTH_EMAIL },
      select: { email: true },
    });
    expect(stored.email).toBe(MAX_LENGTH_EMAIL);
  });

  it("rejects a 255-char email with a validation error (not a DB error)", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        name: "Over Email Student",
        username: "over_email_student",
        email: MAX_LENGTH_EMAIL + "x",
        password: "student123",
      });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("email");
  });

  it("admin adds a teacher with a 254-char email end-to-end", async () => {
    const res = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Long Email Teacher",
        username: "long_email_teacher",
        email: MAX_LENGTH_EMAIL,
        password: "teacher123",
        subject: "Math",
        gradeClass: "1st year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      })
      .expect(201);
    expectSuccessShape(res);
    expect(res.body.data.teacher.email).toBe(MAX_LENGTH_EMAIL);
  });

  it("admin adding a teacher with a 255-char email is rejected with 400", async () => {
    const res = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Over Email Teacher",
        username: "over_email_teacher",
        email: MAX_LENGTH_EMAIL + "x",
        password: "teacher123",
        subject: "Math",
        gradeClass: "1st year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("email");
  });

  it("admin adds content with a 255-char title and 500-char fileUrl end-to-end", async () => {
    const res = await request(app)
      .post(`/api/admin/teachers/${state.teacherBId}/content`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        type: "LESSON_CONTENT",
        title: MAX_LENGTH_TITLE,
        fileUrl: MAX_LENGTH_FILE_URL,
      })
      .expect(201);
    expectSuccessShape(res);
    expect(res.body.data.content.title.length).toBe(255);
    expect(res.body.data.content.fileUrl.length).toBe(500);

    const stored = await prisma.teacherContent.findUnique({
      where: { id: res.body.data.content.id },
      select: { title: true, fileUrl: true },
    });
    expect(stored.title.length).toBe(255);
    expect(stored.fileUrl.length).toBe(500);
  });

  it("rejects a 256-char title with a validation error (not a DB error)", async () => {
    const res = await request(app)
      .post(`/api/admin/teachers/${state.teacherBId}/content`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({ type: "LECTURE", title: "t".repeat(256) });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("title");
  });

  it("rejects a 501-char fileUrl with a validation error (not a DB error)", async () => {
    const res = await request(app)
      .post(`/api/admin/teachers/${state.teacherBId}/content`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        type: "LECTURE",
        title: "Intro",
        fileUrl: "https://media.example.com/".padEnd(501, "a"),
      });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("fileUrl");
  });

  it("a teacher adds max-length title + fileUrl through their own dashboard", async () => {
    const res = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .send({
        type: "HOMEWORK",
        title: MAX_LENGTH_TITLE,
        fileUrl: MAX_LENGTH_FILE_URL,
      })
      .expect(201);
    expectSuccessShape(res);
    expect(res.body.data.content.title.length).toBe(255);
    expect(res.body.data.content.fileUrl.length).toBe(500);
  });

  it("teacher dashboard rejects an over-limit title with 400", async () => {
    const res = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${state.teacherALogin.accessToken}`)
      .send({ type: "HOMEWORK", title: "t".repeat(256) });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details[0].field).toBe("title");
  });
});

describe("One active subscription per teacher, enforced at DB level (Fix Task 5)", () => {
  // Fix Task 5: the "one active subscription per (student, teacher)" rule is
  // also enforced by a database unique index backed by a generated column, so
  // two racing confirm-payment requests cannot produce duplicate ACTIVE rows.
  // This suite uses its own dedicated student/teacher to stay isolated from the
  // ordered state used elsewhere in the file.

  let concStudentToken = null;
  let concStudentId = null;
  let concTeacherId = null;

  // Separate student used for the re-subscription-after-cancel scenario.
  let resubStudentToken = null;
  let resubStudentId = null;

  it("creates students and a teacher for the concurrency scenario", async () => {
    await registerUser({
      name: "Zeta Concurrency Student",
      username: "zeta_concurrency_student",
      email: "zeta_concurrency@test.dev",
      password: "student123",
    });
    const resubRes = await registerUser({
      name: "Resub Student",
      username: "resub_student",
      email: "resub_student@test.dev",
      password: "student123",
    });

    const loginRes = await login("student", "zeta_concurrency_student", "student123");
    concStudentToken = loginRes.token;
    concStudentId = loginRes.user.id;
    resubStudentId = resubRes.body.data.user.id;
    resubStudentToken = (
      await login("student", "resub_student", "student123")
    ).token;

    const teacherRes = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Zeta Teacher",
        username: "zeta_teacher",
        email: "zeta_teacher@test.dev",
        password: "teacher123",
        subject: "History",
        gradeClass: "1st year secondary grade",
        price1Month: 65,
        price3Months: 175,
        price6Months: 325,
        price1Year: 585,
      })
      .expect(201);
    concTeacherId = teacherRes.body.data.teacher.id;
  });

  it("two concurrent confirm-payments yield exactly one success and one already-subscribed error", async () => {
    // Fire both requests at the same time. Each opens its own DB transaction and
    // both can pass the in-transaction application-level duplicate check before
    // either commits; only one insert may survive the (studentId,
    // activeSubscriptionKey) unique index.
    const [a, b] = await Promise.all([
      request(app)
        .post("/api/subscriptions/confirm-payment")
        .set("Authorization", `Bearer ${concStudentToken}`)
        .send({ teacherId: concTeacherId, duration: "ONE_MONTH" }),
      request(app)
        .post("/api/subscriptions/confirm-payment")
        .set("Authorization", `Bearer ${concStudentToken}`)
        .send({ teacherId: concTeacherId, duration: "ONE_MONTH" }),
    ]);

    // Exactly one request succeeded with 201.
    const successes = [a, b].filter((r) => r.status === 201);
    const conflicts = [a, b].filter(
      (r) => r.status === 409 && r.body.error.code === "ACTIVE_SUBSCRIPTION_EXISTS"
    );
    expect(successes.length).toBe(1);
    expect(conflicts.length).toBe(1);

    // The conflicting response is the friendly application error, not a crash
    // or an unhandled database error.
    const winner = successes[0];
    expectSuccessShape(winner);
    expect(String(winner.body.data.subscription.teacherId)).toBe(
      String(concTeacherId)
    );

    // The database contains exactly one ACTIVE subscription for this pair.
    const activeRows = await prisma.subscription.findMany({
      where: {
        studentId: concStudentId,
        teacherId: concTeacherId,
        status: "ACTIVE",
      },
      select: { id: true },
    });
    expect(activeRows.length).toBe(1);
  });

  it("a second subscription attempt is still rejected while one is ACTIVE", async () => {
    const res = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${concStudentToken}`)
      .send({ teacherId: concTeacherId, duration: "ONE_YEAR" });
    expectErrorShape(res, 409, "ACTIVE_SUBSCRIPTION_EXISTS");
  });

  it("a student CAN re-subscribe after a prior subscription is cancelled", async () => {
    // Fresh student subscribes, then the admin cancels it (status -> CANCELLED,
    // generated key -> NULL). The student must be allowed to subscribe again.
    const first = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${resubStudentToken}`)
      .send({ teacherId: concTeacherId, duration: "ONE_MONTH" })
      .expect(201);

    const cancel = await request(app)
      .post(`/api/admin/subscriptions/${first.body.data.subscription.id}/cancel`)
      .set("Authorization", `Bearer ${state.adminToken}`)
      .expect(200);
    expect(cancel.body.data.subscription.status).toBe("CANCELLED");

    const second = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${resubStudentToken}`)
      .send({ teacherId: concTeacherId, duration: "THREE_MONTHS" })
      .expect(201);
    expectSuccessShape(second);
    expect(second.body.data.subscription.status).toBe("ACTIVE");

    // Both the cancelled and the new ACTIVE rows coexist for the same pair.
    const rows = await prisma.subscription.findMany({
      where: { studentId: resubStudentId, teacherId: concTeacherId },
      select: { status: true },
    });
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.status).sort()).toEqual(["ACTIVE", "CANCELLED"]);
  });

  it("a student CAN re-subscribe after a prior subscription is EXPIRED", async () => {
    await registerUser({
      name: "Expiry Student",
      username: "expiry_student",
      email: "expiry_student@test.dev",
      password: "student123",
    });
    const loggedIn = await login("student", "expiry_student", "student123");

    const first = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${loggedIn.token}`)
      .send({ teacherId: concTeacherId, duration: "ONE_MONTH" })
      .expect(201);

    // Force an expired state: status EXPIRED (generated key -> NULL) so the
    // unique index permits the subscription to be taken out again.
    await prisma.subscription.update({
      where: { id: first.body.data.subscription.id },
      data: { status: "EXPIRED" },
    });

    const second = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${loggedIn.token}`)
      .send({ teacherId: concTeacherId, duration: "ONE_MONTH" })
      .expect(201);
    expectSuccessShape(second);
    expect(second.body.data.subscription.status).toBe("ACTIVE");
  });
});

describe("Cross-role username identity resolution", () => {
  // Login accepts username + password without userType and resolves WHICH
  // table to authenticate against server-side. Username uniqueness stays
  // per-table, so a student and a teacher may legitimately share a username;
  // in that ambiguous case the client must disambiguate by supplying userType
  // (409 AMBIGUOUS_USERNAME). An explicit userType keeps the exact previous
  // behavior: it selects one table and never falls back to other tables.
  // Uses its own dedicated accounts so it stays isolated from the ordered state
  // used elsewhere in the file.
  const sharedUsername = "shared_identity";
  const sharedPassword = "shared_pass_123";
  let sharedTeacherId = null;
  let sharedStudentToken = null;

  it("sets up a student and a teacher that share the same username", async () => {
    await registerUser({
      name: "Shared Login Student",
      username: sharedUsername,
      email: "shared_login_student@test.dev",
      password: sharedPassword,
    });

    const teacherRes = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${state.adminToken}`)
      .send({
        name: "Shared Login Teacher",
        username: sharedUsername,
        email: "shared_login_teacher@test.dev",
        password: sharedPassword,
        subject: "English",
        gradeClass: "3rd year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      })
      .expect(201);
    sharedTeacherId = teacherRes.body.data.teacher.id;
  });

  it("a login without userType resolves a unique username server-side", async () => {
    const studentLogin = await request(app)
      .post("/api/auth/login")
      .send({ username: testStudent1.username, password: testStudent1.password })
      .expect(200);
    expectSuccessShape(studentLogin);
    expect(studentLogin.body.data.user.userType).toBe("student");
    expect(studentLogin.body.data.user.username).toBe(testStudent1.username);
  });

  it("a login without userType for a shared username asks for explicit userType", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ username: sharedUsername, password: sharedPassword });
    expectErrorShape(res, 409, "AMBIGUOUS_USERNAME");
  });

  it("a login with an unsupported userType is rejected with 400", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        userType: "moderator",
        username: sharedUsername,
        password: sharedPassword,
      });
    expectErrorShape(res, 400, "VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "userType" })])
    );
  });

  it("a student and a teacher sharing a username each log in independently with userType", async () => {
    const studentLogin = await login("student", sharedUsername, sharedPassword);
    expect(studentLogin.user.userType).toBe("student");
    expect(studentLogin.user.username).toBe(sharedUsername);
    sharedStudentToken = studentLogin.token;

    const teacherLogin = await login("teacher", sharedUsername, sharedPassword);
    expect(teacherLogin.user.userType).toBe("teacher");
    expect(teacherLogin.user.username).toBe(sharedUsername);

    expect(studentLogin.token).not.toBe(teacherLogin.token);
  });

  it("a valid credential pair with the wrong userType cannot authenticate", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        userType: "teacher",
        username: testStudent1.username,
        password: testStudent1.password,
      });
    expectErrorShape(res, 401, "INVALID_CREDENTIALS");
  });

  it("an inactive teacher cannot authenticate even with userType 'teacher' explicitly supplied", async () => {
    await prisma.teacher.update({
      where: { id: sharedTeacherId },
      data: { isActive: false },
    });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ userType: "teacher", username: sharedUsername, password: sharedPassword });
    expectErrorShape(res, 401, "INVALID_CREDENTIALS");
  });

  it("the shared-username student's identity is unaffected by the teacher rejection", async () => {
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", `Bearer ${sharedStudentToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.user.username).toBe(sharedUsername);
  });
});

describe("Swagger UI", () => {
  it("GET /api-docs/ serves the API documentation", async () => {
    const res = await request(app).get("/api-docs/").expect(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text).toContain("Education System API Documentation");
  });
});

describe("Validation-limit fixture cleanup", () => {
  it("removes the long-email fixtures", async () => {
    const student = await prisma.student.findUnique({ where: { username: "long_email_student" }, select: { id: true } });
    if (student) {
      await prisma.refreshToken.deleteMany({ where: { studentId: student.id } });
      await prisma.passwordResetToken.deleteMany({ where: { studentId: student.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { studentId: student.id } });
      await prisma.subscription.deleteMany({ where: { studentId: student.id } });
      await prisma.student.deleteMany({ where: { id: student.id } });
    }
    const teacher = await prisma.teacher.findUnique({ where: { username: "long_email_teacher" }, select: { id: true } });
    if (teacher) {
      await prisma.refreshToken.deleteMany({ where: { teacherId: teacher.id } });
      await prisma.passwordResetToken.deleteMany({ where: { teacherId: teacher.id } });
      await prisma.emailVerificationToken.deleteMany({ where: { teacherId: teacher.id } });
      await prisma.subscription.deleteMany({ where: { teacherId: teacher.id } });
      await prisma.teacherContent.deleteMany({ where: { teacherId: teacher.id } });
      await prisma.teacher.deleteMany({ where: { id: teacher.id } });
    }
  });
});