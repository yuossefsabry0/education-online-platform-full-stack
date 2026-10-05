const bcrypt = require("bcryptjs");
const prisma = require("../../src/db/prisma");
const { runExpirationPass, CHECK_INTERVAL_MS } = require("../../src/jobs/expireSubscriptions");

const TEACHER = "t2_expiry_teacher";
const STUDENT = "t2_expiry_student";

let teacherId;
let studentId;

async function pastActiveSubscription(student, teacher) {
  const startDate = new Date(Date.now() - 86400000);
  const endDate = new Date(startDate.getTime() + 1000);
  return prisma.subscription.create({
    data: {
      studentId: student,
      teacherId: teacher,
      teacherRole: `SUB${teacher}`,
      duration: "ONE_MONTH",
      price: 60,
      startDate,
      endDate,
      status: "ACTIVE",
    },
  });
}

async function expiredLogCount(subId) {
  return prisma.logHistory.count({
    where: { actionType: "SUBSCRIPTION_EXPIRED", targetId: String(subId) },
  });
}

beforeAll(async () => {
  const teacher = await prisma.teacher.create({
    data: {
      name: "T2 Expiry Teacher",
      username: TEACHER,
      email: "t2expiry@test.dev",
      password: await bcrypt.hash("teacher123", 4),
      subject: "Math",
      gradeClass: "1st year secondary grade",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    },
    select: { id: true },
  });
  teacherId = teacher.id;
  const student = await prisma.student.create({
    data: {
      name: "T2 Expiry Student",
      username: STUDENT,
      email: "t2expiry@test.dev",
      password: await bcrypt.hash("student123", 4),
    },
    select: { id: true },
  });
  studentId = student.id;
}, 60000);

afterAll(async () => {
  const subs = await prisma.subscription.findMany({
    where: { OR: [{ studentId }, { teacherId }] },
    select: { id: true },
  });
  const ids = subs.map((s) => String(s.id));
  if (ids.length) {
    await prisma.logHistory.deleteMany({ where: { targetId: { in: ids } } });
  }
  await prisma.refreshToken.deleteMany({ where: { OR: [{ studentId }, { teacherId }] } });
  await prisma.passwordResetToken.deleteMany({ where: { OR: [{ studentId }, { teacherId }] } });
  await prisma.emailVerificationToken.deleteMany({ where: { OR: [{ studentId }, { teacherId }] } });
  await prisma.subscription.deleteMany({ where: { OR: [{ studentId }, { teacherId }] } });
  await prisma.student.deleteMany({ where: { id: studentId } });
  await prisma.teacher.deleteMany({ where: { id: teacherId } });
  await prisma.$disconnect();
});

describe("subscription expiry job", () => {
  it("keeps the 60s interval", () => {
    expect(CHECK_INTERVAL_MS).toBe(60000);
  });

  it("expires past ACTIVE subscriptions with exactly one log row", async () => {
    const sub = await pastActiveSubscription(studentId, teacherId);
    await runExpirationPass();
    const row = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(row.status).toBe("EXPIRED");
    expect(await expiredLogCount(sub.id)).toBe(1);
  });

  it("creates nothing new on repeated execution", async () => {
    const sub = await pastActiveSubscription(studentId, teacherId);
    await runExpirationPass();
    expect(await expiredLogCount(sub.id)).toBe(1);
    await runExpirationPass();
    expect(await expiredLogCount(sub.id)).toBe(1);
    const row = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(row.status).toBe("EXPIRED");
  });

  it("allows a single transition under concurrent processing", async () => {
    const sub = await pastActiveSubscription(studentId, teacherId);
    await Promise.all([runExpirationPass(), runExpirationPass()]);
    const row = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(row.status).toBe("EXPIRED");
    expect(await expiredLogCount(sub.id)).toBe(1);
  });

  it("leaves already-expired records untouched", async () => {
    const startDate = new Date(Date.now() - 86400000);
    const endDate = new Date(startDate.getTime() + 1000);
    const sub = await prisma.subscription.create({
      data: {
        studentId,
        teacherId,
        teacherRole: `SUB${teacherId}`,
        duration: "ONE_MONTH",
        price: 60,
        startDate,
        endDate,
        status: "EXPIRED",
      },
    });
    await runExpirationPass();
    expect(await expiredLogCount(sub.id)).toBe(0);
    const row = await prisma.subscription.findUnique({ where: { id: sub.id }, select: { status: true } });
    expect(row.status).toBe("EXPIRED");
  });
});
