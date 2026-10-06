const { z } = require("zod");

const SORTABLE_SUBSCRIBER_FIELDS = [
  "id",
  "studentName",
  "studentUsername",
  "studentEmail",
  "teacherName",
  "duration",
  "startDate",
  "endDate",
  "price",
  "status",
  "createdAt",
];

const SORTABLE_LOG_FIELDS = [
  "id",
  "actionType",
  "actorType",
  "actorId",
  "targetId",
  "timestamp",
];

const intParam = (min, max) =>
  z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === "") return undefined;
      return typeof value === "number" ? value : Number(value);
    },
    z
      .number({ error: "Must be a valid number" })
      .int("Must be an integer")
      .min(min, `Must be at least ${min}`)
      .max(max, `Must be at most ${max}`)
  );

const idParam = intParam(1, 1_000_000_000);

const pagination = {
  page: intParam(1, 1_000_000).default(1),
  limit: intParam(1, 50).default(10),
};

const subscriberSorting = {
  sortBy: z
    .enum(SORTABLE_SUBSCRIBER_FIELDS, {
      error: `sortBy must be one of: ${SORTABLE_SUBSCRIBER_FIELDS.join(", ")}`,
    })
    .default("startDate"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
};

const subscribersQuerySchema = z.object({
  ...pagination,
  ...subscriberSorting,
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
});

const perTeacherSubscribersQuerySchema = z.object({
  ...pagination,
  ...subscriberSorting,
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]).optional(),
});

const logsQuerySchema = z.object({
  ...pagination,
  sortBy: z
    .enum(SORTABLE_LOG_FIELDS, {
      error: `sortBy must be one of: ${SORTABLE_LOG_FIELDS.join(", ")}`,
    })
    .default("timestamp"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  actionType: z.string().trim().max(100).optional(),
  actorType: z
    .enum(["STUDENT", "TEACHER", "ADMIN", "SYSTEM"])
    .optional(),
});

const addTeacherSchema = z.object({
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
  subject: z
    .string({ error: "Subject is required" })
    .min(1, "Subject is required")
    .max(100, "Subject must be at most 100 characters"),
  gradeClass: z
    .string({ error: "Grade is required" })
    .min(1, "Grade is required")
    .max(100, "Grade must be at most 100 characters"),
  price1Month: z
    .number({ error: "price1Month is required" })
    .nonnegative("price1Month must be a non-negative number"),
  price3Months: z
    .number({ error: "price3Months is required" })
    .nonnegative("price3Months must be a non-negative number"),
  price6Months: z
    .number({ error: "price6Months is required" })
    .nonnegative("price6Months must be a non-negative number"),
  price1Year: z
    .number({ error: "price1Year is required" })
    .nonnegative("price1Year must be a non-negative number"),
});

const editTeacherSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name cannot be empty")
      .max(100, "Name must be at most 100 characters")
      .optional(),
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username must be at most 30 characters")
      .regex(
        /^[a-zA-Z0-9_]+$/,
        "Username must contain only letters, numbers, and underscores"
      )
      .optional(),
    email: z
      .string()
      .min(1, "Email cannot be empty")
      .email("Invalid email address")
      .max(254, "Email must be at most 254 characters")
      .optional(),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .max(128, "Password must be at most 128 characters")
      .optional(),
    subject: z
      .string()
      .min(1, "Subject cannot be empty")
      .max(100, "Subject must be at most 100 characters")
      .optional(),
    gradeClass: z
      .string()
      .min(1, "Grade cannot be empty")
      .max(100, "Grade must be at most 100 characters")
      .optional(),
    photoUrl: z
      .string()
      .trim()
      .min(1, "Photo URL cannot be empty")
      .max(500, "Photo URL must be at most 500 characters")
      .refine((v) => /^https?:\/\//i.test(v), {
        message: "Photo URL must start with http:// or https://",
      })
      .optional(),
    price1Month: z
      .number()
      .nonnegative("price1Month must be a non-negative number")
      .optional(),
    price3Months: z
      .number()
      .nonnegative("price3Months must be a non-negative number")
      .optional(),
    price6Months: z
      .number()
      .nonnegative("price6Months must be a non-negative number")
      .optional(),
    price1Year: z
      .number()
      .nonnegative("price1Year must be a non-negative number")
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const announcementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(100, "Title must be at most 100 characters"),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(500, "Message must be at most 500 characters"),
});

module.exports = {
  idParam,
  subscribersQuerySchema,
  perTeacherSubscribersQuerySchema,
  logsQuerySchema,
  addTeacherSchema,
  editTeacherSchema,
  announcementSchema,
};