const { z } = require("zod");

const registerSchema = z.object({
  name: z
    .string({ error: "Name is required" })
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  username: z
    .string({ error: "Username is required" })
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Username must contain only letters, numbers, and underscores"
    ),
  email: z
    .string({ error: "Email is required" })
    .min(1, "Email is required")
    .email("Invalid email address")
    .max(254, "Email must be at most 254 characters"),
  password: z
    .string({ error: "Password is required" })
    .min(6, "Password must be at least 6 characters")
    .max(128, "Password must be at most 128 characters"),
});

const loginSchema = z.object({
  // Optional: when omitted, the server resolves the account by username
  // across the student/teacher/admin tables (ambiguous usernames must
  // specify userType explicitly).
  userType: z.enum(["student", "teacher", "admin"], {
    error: "userType must be one of: student, teacher, admin",
  }).optional(),
  username: z.string({ error: "Username is required" }).min(1, "Username is required"),
  password: z.string({ error: "Password is required" }).min(1, "Password is required"),
});

const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ error: "Refresh token is required" })
    .min(1, "Refresh token is required"),
});

module.exports = { registerSchema, loginSchema, refreshTokenSchema };