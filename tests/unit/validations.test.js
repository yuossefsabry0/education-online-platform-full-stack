// Unit tests for the Zod validation schemas used across endpoints.
const {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} = require("../../src/validations/auth.schema");
const {
  addTeacherSchema,
  editTeacherSchema,
  subscribersQuerySchema,
  logsQuerySchema,
} = require("../../src/validations/admin.schema");
const {
  addContentSchema,
  editContentSchema,
} = require("../../src/validations/content.schema");
const {
  teacherIdParam,
  confirmPaymentSchema,
} = require("../../src/validations/subscription.schema");
const {
  listTeachersQuerySchema,
  searchTeachersQuerySchema,
} = require("../../src/validations/teacher.schema");

// Builds a well-formed email of exactly the given length. The base form
// (30-char local part + 223-char dotted domain) is a valid 254-char address;
// longer lengths simply append chars so the result remains email-shaped and
// only fails the length boundary.
function emailOfLength(length) {
  const local = "a".repeat(30);
  const domain =
    "b".repeat(63) + "." + "c".repeat(63) + "." + "d".repeat(63) + "." + "e".repeat(31);
  const base = `${local}@${domain}`; // 254 chars
  return base + "x".repeat(Math.max(0, length - base.length));
}

describe("auth schemas", () => {
  it("accepts valid registration payloads", () => {
    const res = registerSchema.safeParse({
      name: "John",
      username: "john_doe",
      email: "john@example.com",
      password: "secret123",
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid emails", () => {
    const res = registerSchema.safeParse({
      name: "John",
      username: "john_doe",
      email: "nope",
      password: "secret123",
    });
    expect(res.success).toBe(false);
  });

  it("accepts an email at the 254-char DB/VARCHAR limit", () => {
    const res = registerSchema.safeParse({
      name: "John",
      username: "john_doe",
      email: emailOfLength(254),
      password: "secret123",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an email longer than the 254-char DB column", () => {
    const res = registerSchema.safeParse({
      name: "John",
      username: "john_doe",
      email: emailOfLength(255),
      password: "secret123",
    });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(["email"]);
  });

  it("rejects short passwords", () => {
    const res = registerSchema.safeParse({
      name: "John",
      username: "john_doe",
      email: "john@example.com",
      password: "123",
    });
    expect(res.success).toBe(false);
  });

  it("login requires username and password; userType is optional (resolved server-side)", () => {
    expect(loginSchema.safeParse({ username: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ username: "x", password: "y" }).success).toBe(true);
    expect(loginSchema.safeParse({ userType: "", username: "x", password: "y" }).success).toBe(false);
    expect(
      loginSchema.safeParse({ userType: "student", username: "x", password: "y" }).success
    ).toBe(true);
  });

  it("login rejects unsupported account types for userType", () => {
    expect(
      loginSchema.safeParse({ userType: "unknown", username: "x", password: "y" }).success
    ).toBe(false);
    expect(
      loginSchema.safeParse({ userType: "moderator", username: "x", password: "y" }).success
    ).toBe(false);
  });

  it("refresh token requires the token", () => {
    expect(refreshTokenSchema.safeParse({}).success).toBe(false);
    expect(refreshTokenSchema.safeParse({ refreshToken: "abc" }).success).toBe(true);
  });
});

describe("teacher schemas", () => {
  it("adds default pagination and sorting", () => {
    const res = listTeachersQuerySchema.safeParse({});
    expect(res.success).toBe(true);
    expect(res.data.page).toBe(1);
    expect(res.data.limit).toBe(10);
    expect(res.data.sortBy).toBe("id");
  });

  it("coerces string query params to numbers", () => {
    const res = listTeachersQuerySchema.safeParse({ page: "2", limit: "5" });
    expect(res.success).toBe(true);
    expect(res.data.page).toBe(2);
    expect(res.data.limit).toBe(5);
  });

  it("rejects unknown sort fields", () => {
    const res = listTeachersQuerySchema.safeParse({ sortBy: "password" });
    expect(res.success).toBe(false);
  });

  it("search defaults q to empty string", () => {
    const res = searchTeachersQuerySchema.safeParse({});
    expect(res.data.q).toBe("");
  });
});

describe("subscription schemas", () => {
  it("coerces teacherId strings to ints", () => {
    expect(teacherIdParam.safeParse("12").data).toBe(12);
  });

  it("rejects non-positive teacher ids", () => {
    expect(teacherIdParam.safeParse("-3").success).toBe(false);
    expect(teacherIdParam.safeParse("0").success).toBe(false);
  });

  it("confirms valid durations only", () => {
    const good = confirmPaymentSchema.safeParse({
      teacherId: 1,
      duration: "ONE_YEAR",
    });
    expect(good.success).toBe(true);

    const bad = confirmPaymentSchema.safeParse({
      teacherId: 1,
      duration: "FIVE_YEARS",
    });
    expect(bad.success).toBe(false);
  });
});

describe("content schemas", () => {
  it("accepts a valid add-content payload", () => {
    const res = addContentSchema.safeParse({
      type: "LECTURE",
      title: "Intro",
    });
    expect(res.success).toBe(true);
    expect(res.data.isPublished).toBe(true); // defaulted
  });

  it("rejects unknown content types", () => {
    const res = addContentSchema.safeParse({
      type: "VIDEO",
      title: "Intro",
    });
    expect(res.success).toBe(false);
  });

  it("edit-content accepts partial patches of any field", () => {
    expect(editContentSchema.safeParse({ title: "new" }).success).toBe(true);
    expect(editContentSchema.safeParse({ isPublished: false }).success).toBe(true);
    expect(editContentSchema.safeParse({ fileUrl: null }).success).toBe(true);
  });

  it("accepts a title at the 255-char DB/VARCHAR limit", () => {
    const res = addContentSchema.safeParse({
      type: "LECTURE",
      title: "t".repeat(255),
    });
    expect(res.success).toBe(true);
    expect(editContentSchema.safeParse({ title: "t".repeat(255) }).success).toBe(true);
  });

  it("rejects a title longer than the 255-char DB column", () => {
    const res = addContentSchema.safeParse({
      type: "LECTURE",
      title: "t".repeat(256),
    });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(["title"]);
    expect(editContentSchema.safeParse({ title: "t".repeat(256) }).success).toBe(false);
  });

  it("accepts a fileUrl at the 500-char DB/VARCHAR limit", () => {
    const res = addContentSchema.safeParse({
      type: "LECTURE",
      title: "Intro",
      fileUrl: "https://media.example.com/".padEnd(500, "a"),
    });
    expect(res.success).toBe(true);
    expect(
      editContentSchema
        .safeParse({ fileUrl: "https://media.example.com/".padEnd(500, "a") })
        .success
    ).toBe(true);
  });

  it("rejects a fileUrl longer than the 500-char DB column", () => {
    const res = addContentSchema.safeParse({
      type: "LECTURE",
      title: "Intro",
      fileUrl: "https://media.example.com/".padEnd(501, "a"),
    });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(["fileUrl"]);
    expect(
      editContentSchema
        .safeParse({ fileUrl: "https://media.example.com/".padEnd(501, "a") })
        .success
    ).toBe(false);
  });
});

describe("admin schemas", () => {
  it("requires all price fields when adding a teacher", () => {
    const res = addTeacherSchema.safeParse({
      name: "T",
      username: "t_teacher",
      email: "t@test.dev",
      password: "secret123",
      subject: "Math",
      gradeClass: "1st year",
      // missing the 4 prices
    });
    expect(res.success).toBe(false);
  });

  it("allows editing any subset of teacher fields", () => {
    const res = editTeacherSchema.safeParse({ price1Month: 77 });
    expect(res.success).toBe(true);
  });

  it("accepts a teacher email at the 254-char DB/VARCHAR limit", () => {
    const res = addTeacherSchema.safeParse({
      name: "T",
      username: "t_teacher",
      email: emailOfLength(254),
      password: "secret123",
      subject: "Math",
      gradeClass: "1st year",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
    expect(res.success).toBe(true);
    expect(editTeacherSchema.safeParse({ email: emailOfLength(254) }).success).toBe(true);
  });

  it("rejects a teacher email longer than the 254-char DB column", () => {
    const res = addTeacherSchema.safeParse({
      name: "T",
      username: "t_teacher",
      email: emailOfLength(255),
      password: "secret123",
      subject: "Math",
      gradeClass: "1st year",
      price1Month: 60,
      price3Months: 162,
      price6Months: 300,
      price1Year: 540,
    });
    expect(res.success).toBe(false);
    expect(res.error.issues[0].path).toEqual(["email"]);
    expect(editTeacherSchema.safeParse({ email: emailOfLength(255) }).success).toBe(false);
  });

  it("edit-teacher rejects an empty update", () => {
    const res = editTeacherSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it("rejects non-negative price constraints", () => {
    const res = editTeacherSchema.safeParse({ price1Month: -5 });
    expect(res.success).toBe(false);
  });

  it("subscriber listing supports status filter", () => {
    const res = subscribersQuerySchema.safeParse({ status: "ACTIVE" }); // note: status is optional, ACTIVE valid
    expect(res.success).toBe(true);
    const bad = subscribersQuerySchema.safeParse({ status: "UNKNOWN" });
    expect(bad.success).toBe(false);
  });

  it("log queries filter by actorType enum", () => {
    expect(logsQuerySchema.safeParse({ actorType: "ADMIN" }).success).toBe(true);
    expect(logsQuerySchema.safeParse({ actorType: "BOT" }).success).toBe(false);
  });
});