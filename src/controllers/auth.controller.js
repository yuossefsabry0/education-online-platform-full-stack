const bcrypt = require("bcryptjs");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const {
  signLoginToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../utils/token");

const PASSWORD_SALT_ROUNDS = 10;

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

async function createRefreshTokenFor(userType, id) {
  const token = signRefreshToken({ userType, id });
  const ownerType = OWNER_TYPE_MAP[userType];

  const data = {
    token,
    ownerType,
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
    return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
  }

  const token = signLoginToken({ userType, id: user.id });
  const refreshToken = await createRefreshTokenFor(userType, user.id);

  return success(res, {
    token,
    tokenType: "Bearer",
    expiresIn: config.jwt.loginTokenExpiresIn,
    refreshToken,
    user: {
      userType,
      id: user.id,
      username: user.username,
    },
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;

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

  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
  });

  if (!stored || stored.revokedAt) {
    return error(res, "Refresh token has been revoked", 401, "REFRESH_TOKEN_REVOKED");
  }

  if (stored.expiresAt <= new Date()) {
    return error(res, "Refresh token has expired", 401, "REFRESH_TOKEN_EXPIRED");
  }

  const userIdField =
    payload.userType === "student"
      ? "studentId"
      : payload.userType === "teacher"
      ? "teacherId"
      : "adminId";

  if (!stored[userIdField] || stored[userIdField] !== payload.id) {
    return error(res, "Refresh token does not match user", 401, "INVALID_REFRESH_TOKEN");
  }

  if (payload.userType === "teacher") {
    const teacher = await prisma.teacher.findFirst({
      where: { id: payload.id, isActive: true },
      select: { id: true },
    });

    if (!teacher) {
      await prisma.refreshToken.update({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
  }

  const newToken = signLoginToken({ userType: payload.userType, id: payload.id });

  return success(res, {
    token: newToken,
    tokenType: "Bearer",
    expiresIn: config.jwt.loginTokenExpiresIn,
    user: { userType: payload.userType, id: payload.id },
  });
}

async function logout(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return error(res, "Refresh token is required", 400, "REFRESH_TOKEN_REQUIRED");
  }

  const updated = await prisma.refreshToken.updateMany({
    where: { token: refreshToken, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (updated.count === 0) {
    return error(res, "Invalid or already revoked refresh token", 400, "INVALID_REFRESH_TOKEN");
  }

  return success(res, { message: "Logged out successfully" });
}

module.exports = { register, login, refresh, logout };
