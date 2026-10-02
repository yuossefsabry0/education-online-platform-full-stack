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

const S = {};

beforeAll(async () => {
  mailer.resetMailerForTests();
  await prisma.admin.create({
    data: { username: "t3badmin", email: "t3badmin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  S.adminToken = await loginAs("admin", "t3badmin", "admin123");

  const teacherRes = await request(app)
    .post("/api/admin/teachers")
    .set("Authorization", `Bearer ${S.adminToken}`)
    .send({
      name: "T3B Teacher",
      username: "t3b_teacher",
      email: "t3bteacher@test.dev",
      password: "teacher123",
      subject: "Math",
      gradeClass: "1st year secondary grade",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
  S.teacherId = teacherRes.body.data.teacher.id;
  S.teacherToken = await loginAs("teacher", "t3b_teacher", "teacher123");

  await request(app).post("/api/auth/register").send({
    name: "T3B Student",
    username: "t3b_student",
    email: "t3bstudent@test.dev",
    password: "student123",
  });
  S.studentToken = await loginAs("student", "t3b_student", "student123");
  const row = await prisma.student.findUnique({ where: { username: "t3b_student" }, select: { id: true } });
  S.studentId = row.id;

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.studentToken}`)
    .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
    .expect(201);

  for (let i = 1; i <= 12; i += 1) {
    await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .send({ type: "LECTURE", title: `T3B Lecture ${String(i).padStart(2, "0")}`, body: "notes" })
      .expect(201);
  }
}, 60000);

afterAll(async () => {
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] },
    select: { id: true },
  });
  const subIds = subs.map((s) => String(s.id));
  if (subIds.length) await prisma.logHistory.deleteMany({ where: { targetId: { in: subIds } } });
  await prisma.refreshToken.deleteMany({ where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] } });
  await prisma.subscription.deleteMany({ where: { OR: [{ studentId: S.studentId }, { teacherId: S.teacherId }] } });
  const files = await prisma.teacherContent.findMany({
    where: { teacherId: S.teacherId },
    select: { fileUrl: true },
  });
  const { deleteStored, storedNameForUrl } = require("../../src/utils/storage");
  for (const f of files) {
    const name = storedNameForUrl(f.fileUrl);
    if (name) await deleteStored(name);
  }
  await prisma.teacherContent.deleteMany({ where: { teacherId: S.teacherId } });
  await prisma.student.deleteMany({ where: { id: S.studentId } });
  await prisma.teacher.deleteMany({ where: { id: S.teacherId } });
  const admin = await prisma.admin.findUnique({ where: { username: "t3badmin" }, select: { id: true } });
  if (admin) {
    await prisma.refreshToken.deleteMany({ where: { adminId: admin.id } });
    await prisma.admin.deleteMany({ where: { id: admin.id } });
  }
  await prisma.$disconnect();
});

describe("content pagination and search", () => {
  it("returns the first page by default with a pagination envelope", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.section.content).toHaveLength(10);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 10, total: 12, totalPages: 2 });
    expect(res.body.data.section.content[0].title).toBe("T3B Lecture 01");
  });

  it("serves middle, last and empty pages", async () => {
    const last = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ page: 3, limit: 5 })
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expect(last.body.data.section.content).toHaveLength(2);
    expect(last.body.data.pagination).toMatchObject({ page: 3, limit: 5, total: 12, totalPages: 3 });
    const empty = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ page: 9, limit: 5 })
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expect(empty.body.data.section.content).toEqual([]);
    expect(empty.body.data.pagination.total).toBe(12);
  });

  it("rejects invalid and over-maximum paging with 400", async () => {
    const badPage = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ page: 0 })
      .set("Authorization", `Bearer ${S.studentToken}`);
    expectErrorShape(badPage, 400, "VALIDATION_ERROR");
    const overMax = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ limit: 51 })
      .set("Authorization", `Bearer ${S.studentToken}`);
    expectErrorShape(overMax, 400, "VALIDATION_ERROR");
  });

  it("searches titles and combines with pagination", async () => {
    const hit = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ q: "lecture 01" })
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expect(hit.body.data.section.content.length).toBeGreaterThan(0);
    expect(hit.body.data.section.content.map((c) => c.title)).toContain("T3B Lecture 01");
    const miss = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ q: "no-such-title-zzz" })
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expect(miss.body.data.section.content).toEqual([]);
    expect(miss.body.data.pagination.total).toBe(0);
    const combined = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .query({ q: "t3b lecture", page: 2, limit: 5 })
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expect(combined.body.data.section.content).toHaveLength(5);
    expect(combined.body.data.pagination.total).toBe(12);
  });

  it("keeps authorization on paged routes", async () => {
    const anon = await request(app).get(`/api/content/teacher/${S.teacherId}/lectures`);
    expectErrorShape(anon, 401, "UNAUTHORIZED");
    const admin = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/lectures`)
      .set("Authorization", `Bearer ${S.adminToken}`);
    expectErrorShape(admin, 403, "FORBIDDEN");
  });

  it("paginates the teacher dashboard list", async () => {
    const res = await request(app)
      .get("/api/teacher/dashboard")
      .query({ page: 1, limit: 5 })
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .expect(200);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 5, total: 12, totalPages: 3 });
    const flat = (res.body.data.sections || []).flatMap((s) => s.content || []);
    expect(flat).toHaveLength(5);
    const searched = await request(app)
      .get("/api/teacher/dashboard")
      .query({ q: "LECTURE 12" })
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .expect(200);
    expect(searched.body.data.pagination.total).toBe(1);
  });
});

describe("file upload and retrieval", () => {
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

  it("uploads a valid file and serves its bytes to subscribers", async () => {
    const up = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .attach("file", png, "notes.png")
      .expect(201);
    expectSuccessShape(up);
    expect(up.body.data.fileUrl).toMatch(/^\/api\/files\/[a-f0-9]{32}\.png$/);
    const created = await request(app)
      .post("/api/teacher/dashboard/content")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .send({ type: "LECTURE", title: "T3B upload ref", fileUrl: up.body.data.fileUrl })
      .expect(201);
    expect(created.body.data.content.fileUrl).toBe(up.body.data.fileUrl);
    const got = await request(app)
      .get(up.body.data.fileUrl)
      .set("Authorization", `Bearer ${S.studentToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(got.headers["content-type"]).toContain("image/png");
    expect(Buffer.compare(got.body, png)).toBe(0);
  });

  it("rejects unsupported types and missing files", async () => {
    const bad = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .attach("file", Buffer.from("MZ"), "evil.exe")
      .expect(400);
    expectErrorShape(bad, 400, "UNSUPPORTED_FILE_TYPE");
    const missing = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .send({});
    expectErrorShape(missing, 400, "FILE_REQUIRED");
  });

  it("rejects oversized files with 413", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 1);
    const res = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .attach("file", big, "big.png");
    expectErrorShape(res, 413, "FILE_TOO_LARGE");
  });

  it("denies anonymous and unauthorized users", async () => {
    const anon = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .attach("file", png, "notes.png");
    expectErrorShape(anon, 401, "UNAUTHORIZED");
    const student = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .attach("file", png, "notes.png");
    expectErrorShape(student, 403, "FORBIDDEN");
  });

  it("contains malicious filenames inside the storage root", async () => {
    const up = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .attach("file", png, "../../traversal.png")
      .expect(201);
    expect(up.body.data.fileUrl).toMatch(/^\/api\/files\/[a-f0-9]{32}\.png$/);
    expect(up.body.data.fileUrl).not.toContain("..");
  });

  it("returns 404 for unknown stored names", async () => {
    const fake = `/api/files/${"a".repeat(32)}.png`;
    await prisma.teacherContent.create({
      data: { teacherId: S.teacherId, type: "LECTURE", title: "ghost", fileUrl: fake, isPublished: true },
    });
    const res = await request(app)
      .get(fake)
      .set("Authorization", `Bearer ${S.studentToken}`);
    expectErrorShape(res, 404, "NOT_FOUND");
  });

  it("denies unsubscribed students the bytes", async () => {
    const up = await request(app)
      .post("/api/teacher/dashboard/content/upload")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .attach("file", png, "private.png")
      .expect(201);
    await prisma.teacherContent.create({
      data: { teacherId: S.teacherId, type: "LECTURE", title: "private", fileUrl: up.body.data.fileUrl, isPublished: true },
    });
    await request(app).post("/api/auth/register").send({
      name: "T3B Stranger",
      username: "t3b_stranger",
      email: "t3bstranger@test.dev",
      password: "student123",
    });
    const stranger = await loginAs("student", "t3b_stranger", "student123");
    const res = await request(app)
      .get(up.body.data.fileUrl)
      .set("Authorization", `Bearer ${stranger}`);
    expectErrorShape(res, 403, "SUBSCRIPTION_REQUIRED");
    const sRow = await prisma.student.findUnique({ where: { username: "t3b_stranger" }, select: { id: true } });
    await prisma.refreshToken.deleteMany({ where: { studentId: sRow.id } });
    await prisma.student.deleteMany({ where: { id: sRow.id } });
  });
});

describe("student history view", () => {
  it("returns only the student's own scoped records", async () => {
    const res = await request(app)
      .get("/api/user/history")
      .set("Authorization", `Bearer ${S.studentToken}`)
      .expect(200);
    expectSuccessShape(res);
    expect(res.body.data.subscriptions.items.length).toBeGreaterThan(0);
    expect(res.body.data.subscriptions.pagination).toMatchObject({ page: 1 });
    for (const item of res.body.data.subscriptions.items) {
      expect(item.teacherRole).toBe(`SUB${S.teacherId}`);
      expect(item).not.toHaveProperty("password");
    }
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("password");
    expect(body).not.toContain("t3b_stranger");
  });

  it("denies anonymous and non-student callers", async () => {
    const anon = await request(app).get("/api/user/history");
    expectErrorShape(anon, 401, "UNAUTHORIZED");
    const teacher = await request(app)
      .get("/api/user/history")
      .set("Authorization", `Bearer ${S.teacherToken}`);
    expectErrorShape(teacher, 403, "FORBIDDEN");
    const admin = await request(app)
      .get("/api/user/history")
      .set("Authorization", `Bearer ${S.adminToken}`);
    expectErrorShape(admin, 403, "FORBIDDEN");
  });
});

describe("subscription notifications", () => {
  async function makeStudent(username) {
    await request(app).post("/api/auth/register").send({
      name: `${username} Name`,
      username,
      email: `${username}@test.dev`,
      password: "student123",
    });
    const row = await prisma.student.findUnique({ where: { username }, select: { id: true } });
    return row.id;
  }

  async function removeStudent(username) {
    const row = await prisma.student.findUnique({ where: { username }, select: { id: true } });
    if (!row) return;
    const subs = await prisma.subscription.findMany({ where: { studentId: row.id }, select: { id: true } });
    const ids = subs.map((s) => String(s.id));
    if (ids.length) await prisma.logHistory.deleteMany({ where: { targetId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { studentId: row.id } });
    await prisma.subscription.deleteMany({ where: { studentId: row.id } });
    await prisma.student.deleteMany({ where: { id: row.id } });
  }

  it("notifies exactly once on expiry", async () => {
    const studentId = await makeStudent("t3b_exp1");
    const past = new Date(Date.now() - 86400000);
    const sub = await prisma.subscription.create({
      data: {
        studentId,
        teacherId: S.teacherId,
        teacherRole: `SUB${S.teacherId}`,
        duration: "ONE_MONTH",
        price: 60,
        startDate: past,
        endDate: past,
        status: "ACTIVE",
      },
    });
    await runExpirationPass();
    const sent = await prisma.logHistory.count({
      where: { actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED", targetId: String(sub.id) },
    });
    expect(sent).toBe(1);
    await runExpirationPass();
    const again = await prisma.logHistory.count({
      where: { actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED", targetId: String(sub.id) },
    });
    expect(again).toBe(1);
    const row = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { expiryNotifiedAt: true } });
    expect(row.expiryNotifiedAt).not.toBeNull();
    await removeStudent("t3b_exp1");
  });

  it("notifies exactly once per cancellation path", async () => {
    await request(app).post("/api/auth/register").send({
      name: "T3B Self Cancel",
      username: "t3b_selfcancel",
      email: "t3bselfcancel@test.dev",
      password: "student123",
    });
    const selfToken = await loginAs("student", "t3b_selfcancel", "student123");
    const selfCreated = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${selfToken}`)
      .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
      .expect(201);
    const selfId = selfCreated.body.data.subscription.id;
    await request(app)
      .post(`/api/subscriptions/${selfId}/cancel`)
      .set("Authorization", `Bearer ${selfToken}`)
      .expect(200);
    expect(
      await prisma.logHistory.count({
        where: { actionType: "SUBSCRIPTION_CANCEL_NOTIFIED", targetId: String(selfId) },
      })
    ).toBe(1);
    const selfRow = await prisma.student.findUnique({ where: { username: "t3b_selfcancel" }, select: { id: true } });
    await prisma.refreshToken.deleteMany({ where: { studentId: selfRow.id } });
    await prisma.subscription.deleteMany({ where: { studentId: selfRow.id } });
    await prisma.student.deleteMany({ where: { id: selfRow.id } });
    await request(app).post("/api/auth/register").send({
      name: "T3B Cancelled",
      username: "t3b_cancelled",
      email: "t3bcancelled@test.dev",
      password: "student123",
    });
    const token = await loginAs("student", "t3b_cancelled", "student123");
    const created = await request(app)
      .post("/api/subscriptions/confirm-payment")
      .set("Authorization", `Bearer ${token}`)
      .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
      .expect(201);
    const adminSubId = created.body.data.subscription.id;
    await request(app)
      .post(`/api/admin/subscriptions/${adminSubId}/cancel`)
      .set("Authorization", `Bearer ${S.adminToken}`)
      .expect(200);
    expect(
      await prisma.logHistory.count({
        where: { actionType: "SUBSCRIPTION_CANCEL_NOTIFIED", targetId: String(adminSubId) },
      })
    ).toBe(1);
    const cRow = await prisma.student.findUnique({ where: { username: "t3b_cancelled" }, select: { id: true } });
    await prisma.refreshToken.deleteMany({ where: { studentId: cRow.id } });
    await prisma.subscription.deleteMany({ where: { studentId: cRow.id } });
    await prisma.student.deleteMany({ where: { id: cRow.id } });
  });

  it("records notification failures without crashing the job", async () => {
    const spy = jest.spyOn(mailer, "sendMail").mockRejectedValueOnce(new Error("smtp down"));
    const studentId = await makeStudent("t3b_exp2");
    const past = new Date(Date.now() - 86400000);
    const sub = await prisma.subscription.create({
      data: {
        studentId,
        teacherId: S.teacherId,
        teacherRole: `SUB${S.teacherId}`,
        duration: "ONE_MONTH",
        price: 60,
        startDate: past,
        endDate: past,
        status: "ACTIVE",
      },
    });
    try {
      await runExpirationPass();
    } finally {
      spy.mockRestore();
    }
    const failed = await prisma.logHistory.findMany({
      where: { actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED", targetId: String(sub.id) },
    });
    expect(failed.length).toBe(1);
    expect(failed[0].details.status).toBe("failed");
    await runExpirationPass();
    const retried = await prisma.logHistory.findMany({
      where: { actionType: "SUBSCRIPTION_EXPIRY_NOTIFIED", targetId: String(sub.id) },
    });
    expect(retried.filter((r) => r.details.status === "sent").length).toBe(1);
    await removeStudent("t3b_exp2");
  });
});
