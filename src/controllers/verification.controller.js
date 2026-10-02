const prisma = require("../db/prisma");
const { success, error } = require("../utils/apiResponse");
const { newRawToken, hashToken } = require("../utils/singleUseToken");
const mailer = require("../utils/mailer");

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const USER_TABLES = {
  student: prisma.student,
  teacher: prisma.teacher,
  admin: prisma.admin,
};

const USER_ID_FIELDS = {
  student: "studentId",
  teacher: "teacherId",
  admin: "adminId",
};

const OWNER_TYPE_MAP = {
  student: "STUDENT",
  teacher: "TEACHER",
  admin: "ADMIN",
};

async function findAccountByEmail(userType, email) {
  if (userType) {
    const row = await USER_TABLES[userType].findUnique({
      where: { email },
      select: { id: true, email: true },
    });
    return row ? { userType, account: row } : null;
  }
  const [student, teacher, admin] = await Promise.all([
    prisma.student.findUnique({ where: { email }, select: { id: true } }),
    prisma.teacher.findUnique({ where: { email }, select: { id: true } }),
    prisma.admin.findUnique({ where: { email }, select: { id: true } }),
  ]);
  const hits = [];
  if (student) hits.push("student");
  if (teacher) hits.push("teacher");
  if (admin) hits.push("admin");
  if (hits.length !== 1) return null;
  const row = await USER_TABLES[hits[0]].findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  return { userType: hits[0], account: row };
}

async function resendVerification(req, res, next) {
  try {
    const { userType, email } = req.body;
    const found = await findAccountByEmail(userType, email);
    if (found) {
      const field = USER_ID_FIELDS[found.userType];
      await prisma.emailVerificationToken.updateMany({
        where: { [field]: found.account.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const raw = newRawToken();
      await prisma.emailVerificationToken.create({
        data: {
          tokenHash: hashToken(raw),
          ownerType: OWNER_TYPE_MAP[found.userType],
          [field]: found.account.id,
          expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
        },
      });
      await mailer.sendMail({
        to: found.account.email,
        subject: "Verify your email",
        text: `Use this token within 24 hours to verify your email: ${raw}`,
      });
    }
    return success(res, {
      message: "If an account exists for this email, a verification token has been sent.",
    });
  } catch (err) {
    next(err);
  }
}

async function confirmVerification(req, res, next) {
  try {
    const { token } = req.body;
    const stored = await prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.usedAt || stored.expiresAt <= new Date()) {
      return error(res, "Invalid or expired verification token", 401, "INVALID_VERIFICATION_TOKEN");
    }
    const userType =
      stored.ownerType === "STUDENT" ? "student" : stored.ownerType === "TEACHER" ? "teacher" : "admin";
    const field = USER_ID_FIELDS[userType];
    const ownerId = stored[field];
    if (!ownerId) {
      return error(res, "Invalid or expired verification token", 401, "INVALID_VERIFICATION_TOKEN");
    }
    await prisma.$transaction([
      USER_TABLES[userType].update({
        where: { id: ownerId },
        data: { emailVerified: true, verifiedAt: new Date() },
      }),
      prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    ]);
    return success(res, {
      message: "Email verified.",
      user: { userType, id: ownerId },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { resendVerification, confirmVerification, VERIFY_TOKEN_TTL_MS };
