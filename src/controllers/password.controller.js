const bcrypt = require("bcryptjs");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const { httpError } = require("../utils/httpError");
const { clearRefreshCookie } = require("../utils/refreshCookie");
const { newRawToken, hashToken } = require("../utils/singleUseToken");
const mailer = require("../utils/mailer");

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

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

async function revokeAllSessions(userType, id) {
  const field = USER_ID_FIELDS[userType];
  await prisma.refreshToken.updateMany({
    where: { [field]: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function findAccount(userType, id) {
  return USER_TABLES[userType].findUnique({
    where: { id },
    select: { id: true, username: true, email: true, password: true },
  });
}

async function findAccountByEmail(userType, email) {
  if (userType) {
    const row = await USER_TABLES[userType].findUnique({
      where: { email },
      select: { id: true, username: true, email: true },
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
    select: { id: true, username: true, email: true },
  });
  return { userType: hits[0], account: row };
}

async function changePassword(req, res, next) {
  try {
    const { userType, id } = req.user;
    const { currentPassword, newPassword } = req.body;
    const account = await findAccount(userType, id);
    if (!account) {
      return error(res, "Authentication required", 401, "UNAUTHORIZED");
    }
    const matches = await bcrypt.compare(currentPassword, account.password);
    if (!matches) {
      return error(res, "Current password is incorrect", 401, "INVALID_CURRENT_PASSWORD");
    }
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await USER_TABLES[userType].update({
      where: { id },
      data: { password: passwordHash },
    });
    await revokeAllSessions(userType, id);
    clearRefreshCookie(res);
    return success(res, { message: "Password changed. Please log in again." });
  } catch (err) {
    next(err);
  }
}

async function requestReset(req, res, next) {
  try {
    const { userType, email } = req.body;
    const found = await findAccountByEmail(userType, email);
    if (found) {
      const field = USER_ID_FIELDS[found.userType];
      await prisma.passwordResetToken.updateMany({
        where: { [field]: found.account.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      const raw = newRawToken();
      await prisma.passwordResetToken.create({
        data: {
          tokenHash: hashToken(raw),
          ownerType: OWNER_TYPE_MAP[found.userType],
          [field]: found.account.id,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await mailer.sendMail({
        to: found.account.email,
        subject: "Password reset",
        text: `Use this token within 1 hour to reset your password: ${raw}`,
      });
    }
    return success(res, {
      message: "If an account exists for this email, a reset token has been sent.",
    });
  } catch (err) {
    next(err);
  }
}

async function confirmReset(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    const claimed = await prisma.passwordResetToken.updateMany({
      where: { tokenHash: hashToken(token), usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      return error(res, "Invalid or expired reset token", 401, "INVALID_RESET_TOKEN");
    }
    const stored = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!stored || stored.expiresAt <= new Date()) {
      return error(res, "Invalid or expired reset token", 401, "INVALID_RESET_TOKEN");
    }
    const userType =
      stored.ownerType === "STUDENT" ? "student" : stored.ownerType === "TEACHER" ? "teacher" : "admin";
    const field = USER_ID_FIELDS[userType];
    const ownerId = stored[field];
    if (!ownerId) {
      return error(res, "Invalid or expired reset token", 401, "INVALID_RESET_TOKEN");
    }
    const passwordHash = await bcrypt.hash(newPassword, config.security.bcryptRounds);
    await prisma.$transaction([
      USER_TABLES[userType].update({ where: { id: ownerId }, data: { password: passwordHash } }),
      prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
      prisma.refreshToken.updateMany({ where: { [field]: ownerId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    clearRefreshCookie(res);
    return success(res, { message: "Password reset. Please log in again." });
  } catch (err) {
    if (err && err.code === "P2025") {
      return next(httpError(401, "INVALID_RESET_TOKEN", "Invalid or expired reset token"));
    }
    next(err);
  }
}

module.exports = { changePassword, requestReset, confirmReset, RESET_TOKEN_TTL_MS, revokeAllSessions };
