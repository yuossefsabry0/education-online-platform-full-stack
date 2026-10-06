const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const {
  signLoginToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/token");
const {
  setRefreshCookie,
  clearRefreshCookie,
  getPresentedRefreshToken,
} = require("../utils/refreshCookie");
const { newRawToken, hashToken } = require("../utils/singleUseToken");
const mailer = require("../utils/mailer");

const PASSWORD_SALT_ROUNDS = config.security.bcryptRounds;
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const OWNER_TYPE_MAP = {
  student: "STUDENT",
  teacher: "TEACHER",
  admin: "ADMIN",
};

async function register(req, res) {
  const { name, username, email, password } = req.body;

  const existing = await prisma.student.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true, username: true, email: true },
  });

  if (existing) {
    const field = existing.username === username ? "username" : "email";
    return error(
      res,
      `${field === "username" ? "Username" : "Email"} already in use`,
      409,
      "DUPLICATE_FIELD",
      { field }
    );
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);

  const student = await prisma.student.create({
    data: {
      name,
      username,
      email,
      password: passwordHash,
    },
    select: { id: true, name: true, username: true, email: true },
  });

  const raw = newRawToken();
  await prisma.emailVerificationToken.create({
    data: {
      tokenHash: hashToken(raw),
      ownerType: "STUDENT",
      studentId: student.id,
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });
  try {
    await mailer.sendMail({
      to: student.email,
      subject: "Verify your email",
      text: `Use this token within 24 hours to verify your email: ${raw}`,
    });
  } catch {
    return success(
      res,
      { user: student, message: "Registration successful. Please log in. Verification email could not be sent, request a new token from the verify page." },
      201
    );
  }

  return success(
    res,
    { user: student, message: "Registration successful. Please log in." },
    201
  );
}

const USER_TABLES = {
  student: prisma.student,
  teacher: prisma.teacher,
  admin: prisma.admin,
};

function computeRefreshExpiry() {
  const seconds = parseDurationToSeconds(config.jwt.refreshExpiresIn);
  return new Date(Date.now() + seconds * 1000);
}

function parseDurationToSeconds(value) {
  const match = String(value).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60;
  const amount = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  return amount * (multipliers[unit] || 86400);
}

async function createRefreshTokenFor(userType, id, familyId) {
  const token = signRefreshToken({ userType, id });
  const ownerType = OWNER_TYPE_MAP[userType];

  const data = {
    token,
    ownerType,
    familyId: familyId || crypto.randomUUID(),
    expiresAt: computeRefreshExpiry(),
  };

  if (userType === "student") data.studentId = id;
  if (userType === "teacher") data.teacherId = id;
  if (userType === "admin") data.adminId = id;

  await prisma.refreshToken.create({ data });

  return token;
}

// Resolves a login identity when the client omits userType. Usernames are
// unique only per table, so a username may exist in several tables at once.
// Returns { userType, user } for a single match, { ambiguous: true } when the
// username exists in more than one table, or null when it exists nowhere.
// A teacher match is returned as-is (including inactive ones) so the caller
// below applies the exact same password/active checks as the explicit path.
async function resolveLoginIdentity(username) {
  const [student, teacher, admin] = await Promise.all([
    USER_TABLES.student.findUnique({
      where: { username },
      select: { id: true, username: true, password: true },
    }),
    USER_TABLES.teacher.findUnique({
      where: { username },
      select: { id: true, username: true, password: true, isActive: true },
    }),
    USER_TABLES.admin.findUnique({
      where: { username },
      select: { id: true, username: true, password: true },
    }),
  ]);

  const candidates = [];
  if (student) candidates.push({ userType: "student", user: student });
  if (teacher) candidates.push({ userType: "teacher", user: teacher });
  if (admin) candidates.push({ userType: "admin", user: admin });

  if (candidates.length === 0) return null;
  if (candidates.length > 1) return { ambiguous: true };
  return candidates[0];
}

async function login(req, res) {
  const { username, password } = req.body;
  let userType = req.body.userType;

  let user;
  if (userType) {
    user = await USER_TABLES[userType].findUnique({
      where: { username },
      select:
        userType === "teacher"
          ? { id: true, username: true, password: true, isActive: true }
          : { id: true, username: true, password: true },
    });
  } else {
    const resolved = await resolveLoginIdentity(username);
    if (!resolved) {
      return error(res, "Invalid username or password", 401, "INVALID_CREDENTIALS");
    }
    if (resolved.ambiguous) {
      return error(
        res,
        "Multiple accounts share this username. Specify account type (userType: student, teacher, or admin) to log in.",
        409,
        "AMBIGUOUS_USERNAME"
      );
    }
    userType = resolved.userType;
    user = resolved.user;
  }

  if (!user) {
    return error(res, "Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  const passwordMatches = await bcrypt.compare(password, user.password);
  if (!passwordMatches) {
    return error(res, "Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  if (userType === "teacher" && user.isActive === false) {
    return error(res, "Invalid username or password", 401, "INVALID_CREDENTIALS");
  }

  const token = signLoginToken({ userType, id: user.id });
  const refreshToken = await createRefreshTokenFor(userType, user.id);
  setRefreshCookie(res, refreshToken);

  // Record the sign-in so the notification feed can surface "at login"
  // events. Never allowed to break login itself.
  try {
    await prisma.logHistory.create({
      data: {
        actionType: "LOGIN_SUCCESS",
        actorId: String(user.id),
        actorType: OWNER_TYPE_MAP[userType] || "STUDENT",
        targetId: String(user.id),
        details: { userType, username: user.username },
      },
    });
  } catch {
    /* login succeeds even if the audit write fails */
  }

  return success(res, {
    token,
    tokenType: "Bearer",
    expiresIn: config.jwt.loginTokenExpiresIn,
    user: {
      userType,
      id: user.id,
      username: user.username,
    },
  });
}

async function refresh(req, res) {
  const refreshToken = getPresentedRefreshToken(req);

  if (!refreshToken) {
    return error(res, "Refresh token is required", 400, "REFRESH_TOKEN_REQUIRED");
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return error(res, "Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
  }

  if (!payload || !payload.userType || !payload.id) {
    return error(res, "Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
  }

  const now = new Date();
  let rotation;
  let attempts = 0;
  while (true) {
    attempts += 1;
    try {
      rotation = await prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { token: refreshToken, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
      if (claimed.count !== 1) {
        const stored = await tx.refreshToken.findUnique({
          where: { token: refreshToken },
        });
        if (stored && stored.revokedAt) {
          if (stored.familyId) {
            await tx.refreshToken.updateMany({
              where: { familyId: stored.familyId, revokedAt: null },
              data: { revokedAt: now },
            });
          }
          const err = new Error("Refresh token has been revoked");
          err.status = 401;
          err.code = "REFRESH_TOKEN_REVOKED";
          throw err;
        }
        if (stored && stored.expiresAt <= now) {
          const err = new Error("Refresh token has expired");
          err.status = 401;
          err.code = "REFRESH_TOKEN_EXPIRED";
          throw err;
        }
        const err = new Error("Refresh token has been revoked");
        err.status = 401;
        err.code = "REFRESH_TOKEN_REVOKED";
        throw err;
      }
      const stored = await tx.refreshToken.findUnique({
        where: { token: refreshToken },
      });
      const userIdField =
        payload.userType === "student"
          ? "studentId"
          : payload.userType === "teacher"
          ? "teacherId"
          : "adminId";
      if (!stored || !stored[userIdField] || stored[userIdField] !== payload.id) {
        const err = new Error("Invalid refresh token");
        err.status = 401;
        err.code = "INVALID_REFRESH_TOKEN";
        throw err;
      }
      if (payload.userType === "teacher") {
        const teacher = await tx.teacher.findFirst({
          where: { id: payload.id, isActive: true },
          select: { id: true },
        });
        if (!teacher) {
          return { inactiveTeacher: true };
        }
      }
      const familyId = stored.familyId || crypto.randomUUID();
      const nextRefresh = signRefreshToken({ userType: payload.userType, id: payload.id });
      const ownerType = OWNER_TYPE_MAP[payload.userType];
      const data = {
        token: nextRefresh,
        ownerType,
        familyId,
        expiresAt: computeRefreshExpiry(),
      };
      if (payload.userType === "student") data.studentId = payload.id;
      if (payload.userType === "teacher") data.teacherId = payload.id;
      if (payload.userType === "admin") data.adminId = payload.id;
      await tx.refreshToken.create({ data });
      return { nextRefresh };
      });
      break;
    } catch (err) {
      if (err && err.code === "P2034" && attempts < 3) continue;
      if (err.status && err.code) {
        return error(res, err.message, err.status, err.code);
      }
      throw err;
    }
  }

  const newToken = signLoginToken({ userType: payload.userType, id: payload.id });

  if (rotation.inactiveTeacher) {
    return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
  }

  setRefreshCookie(res, rotation.nextRefresh);

  return success(res, {
    token: newToken,
    tokenType: "Bearer",
    expiresIn: config.jwt.loginTokenExpiresIn,
    user: { userType: payload.userType, id: payload.id },
  });
}

async function logout(req, res) {
  const refreshToken = getPresentedRefreshToken(req);

  if (!refreshToken) {
    clearRefreshCookie(res);
    return error(res, "Refresh token is required", 400, "REFRESH_TOKEN_REQUIRED");
  }

  const updated = await prisma.refreshToken.updateMany({
    where: { token: refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  clearRefreshCookie(res);

  if (updated.count === 0) {
    return error(res, "Invalid or already revoked refresh token", 400, "INVALID_REFRESH_TOKEN");
  }

  return success(res, { message: "Logged out successfully" });
}

module.exports = { register, login, refresh, logout };
