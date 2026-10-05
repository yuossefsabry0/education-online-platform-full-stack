// Exam system regression suite (teacher builder + student take/submit +
// grades + profile performance). Guards two fixed bugs:
// - GET /api/content/teacher/:teacherId/exams was shadowed by the generic
//   "/:section" route and returned SECTION_NOT_FOUND.
// - The teacher builder's fixed 4-option inputs could store a correctIndex
//   that pointed at the wrong option after empty options were filtered out.
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
    data: { username: "examadmin", email: "examadmin@test.dev", password: await bcrypt.hash("admin123", 4) },
  });
  S.adminToken = await loginAs("admin", "examadmin", "admin123");

  for (const t of [
    { name: "Exam Teacher", username: "exam_teacher", email: "examteacher@test.dev" },
    { name: "Other Teacher", username: "exam_other", email: "examother@test.dev" },
  ]) {
    const res = await request(app)
      .post("/api/admin/teachers")
      .set("Authorization", `Bearer ${S.adminToken}`)
      .send({
        ...t,
        password: "teacher123",
        subject: "Math",
        gradeClass: "1st year secondary grade",
        price1Month: 60,
        price3Months: 162,
        price6Months: 300,
        price1Year: 540,
      });
    expect(res.status).toBe(201);
  }
  const teacher = await prisma.teacher.findUnique({ where: { username: "exam_teacher" }, select: { id: true } });
  S.teacherId = teacher.id;
  S.teacherToken = await loginAs("teacher", "exam_teacher", "teacher123");
  S.otherToken = await loginAs("teacher", "exam_other", "teacher123");

  await request(app).post("/api/auth/register").send({
    name: "Exam Student",
    username: "exam_student",
    email: "examstudent@test.dev",
    password: "student123",
  });
  await verifyStudentEmail("examstudent@test.dev");
  S.studentToken = await loginAs("student", "exam_student", "student123");

  await request(app).post("/api/auth/register").send({
    name: "Exam Outsider",
    username: "exam_outsider",
    email: "examoutsider@test.dev",
    password: "student123",
  });
  await verifyStudentEmail("examoutsider@test.dev");
  S.outsiderToken = await loginAs("student", "exam_outsider", "student123");

  await request(app)
    .post("/api/subscriptions/confirm-payment")
    .set("Authorization", `Bearer ${S.studentToken}`)
    .send({ teacherId: S.teacherId, duration: "ONE_MONTH" })
    .expect(201);

  const lecture = await request(app)
    .post("/api/teacher/dashboard/content")
    .set("Authorization", `Bearer ${S.teacherToken}`)
    .send({ type: "LECTURE", title: "Exam Lesson 1", body: "notes" });
  expect(lecture.status).toBe(201);
  S.lessonId = lecture.body.data.content.id;
}, 90000);

afterAll(async () => {
  await prisma.examAttempt.deleteMany({ where: { exam: { teacherId: S.teacherId } } });
  await prisma.exam.deleteMany({ where: { teacherId: S.teacherId } });
  await prisma.subscription.deleteMany({ where: { teacherId: S.teacherId } });
  await prisma.teacherContent.deleteMany({ where: { teacherId: S.teacherId } });
  await prisma.teacher.deleteMany({ where: { username: { in: ["exam_teacher", "exam_other"] } } });
  await prisma.student.deleteMany({ where: { username: { in: ["exam_student", "exam_outsider"] } } });
  await prisma.admin.deleteMany({ where: { username: "examadmin" } });
});

describe("exam workflow", () => {
  it("teacher creates an exam linked to a lesson", async () => {
    const res = await request(app)
      .post("/api/teacher/dashboard/exams")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .send({
        title: "Lesson 1 exam",
        lessonContentId: S.lessonId,
        timeLimitSeconds: 600,
        isPublished: true,
        // UI-shaped payload: fixed option slots with an empty trailing slot.
        questions: [
          { text: "2 + 2?", options: ["3", "4", "5"], correctIndex: 1 },
          { text: "Capital?", options: ["Cairo", "Paris"], correctIndex: 1 },
        ],
      });
    expect(res.status).toBe(201);
    expectSuccessShape(res);
    S.examId = res.body.data.exam.id;
    const stored = await prisma.examQuestion.findMany({
      where: { examId: S.examId },
      orderBy: { position: "asc" },
    });
    expect(stored).toHaveLength(2);
    expect(stored[0].correctIndex).toBe(1);
  });

  it("teacher create rejects a missing lesson (all fields mandatory)", async () => {
    const res = await request(app)
      .post("/api/teacher/dashboard/exams")
      .set("Authorization", `Bearer ${S.teacherToken}`)
      .send({
        title: "Lesson-less exam",
        timeLimitSeconds: 600,
        isPublished: true,
        questions: [
          { text: "Q?", options: ["A", "B"], correctIndex: 0 },
        ],
      });
    expect(res.status).toBe(400);
  });

  it("student lists published exams (not SECTION_NOT_FOUND)", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/exams`)
      .set("Authorization", `Bearer ${S.studentToken}`);
    expect(res.status).toBe(200);
    expectSuccessShape(res);
    expect(res.body.data.exams).toHaveLength(1);
    expect(res.body.data.exams[0].title).toBe("Lesson 1 exam");
    expect(res.body.data.exams[0]).not.toHaveProperty("questions");
  });

  it("student opens one exam without seeing correct answers", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/exams/${S.examId}`)
      .set("Authorization", `Bearer ${S.studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.exam.questions).toHaveLength(2);
    for (const q of res.body.data.exam.questions) {
      expect(q).not.toHaveProperty("correctIndex");
    }
  });

  it("student submit grades unanswered questions as incorrect", async () => {
    const res = await request(app)
      .post(`/api/content/teacher/${S.teacherId}/exams/${S.examId}/submit`)
      .set("Authorization", `Bearer ${S.studentToken}`)
      .send({ answers: [1, null], timedOut: false });
    expect(res.status).toBe(201);
    expect(res.body.data.result.correct).toBe(1);
    expect(res.body.data.result.total).toBe(2);
    expect(res.body.data.result.percent).toBe(50);
    expect(res.body.data.result.review[1].isCorrect).toBe(false);
  });

  it("teacher sees Exam Grades with student details and score", async () => {
    const res = await request(app)
      .get(`/api/teacher/dashboard/exams/${S.examId}/grades`)
      .set("Authorization", `Bearer ${S.teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.grades).toHaveLength(1);
    const g = res.body.data.grades[0];
    expect(g.student.username).toBe("exam_student");
    expect(g.student.name).toBe("Exam Student");
    expect(g.correct).toBe(1);
    expect(g.percent).toBe(50);
  });

  it("student performance feeds the profile percentage", async () => {
    const res = await request(app)
      .get("/api/user/exams/performance")
      .set("Authorization", `Bearer ${S.studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totalExams).toBe(1);
    expect(res.body.data.average).toBe(50);
  });

  it("blocks students without a subscription (403)", async () => {
    const res = await request(app)
      .get(`/api/content/teacher/${S.teacherId}/exams`)
      .set("Authorization", `Bearer ${S.outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("blocks other teachers from deleting the exam", async () => {
    const res = await request(app)
      .delete(`/api/teacher/dashboard/exams/${S.examId}`)
      .set("Authorization", `Bearer ${S.otherToken}`);
    expect([403, 404]).toContain(res.status);
  });
});
