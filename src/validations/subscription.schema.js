const { z } = require("zod");

// teacherId passed as a URL path parameter (string -> number coercion).
const teacherIdParam = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return typeof value === "number" ? value : Number(value);
  },
  z
    .number({ error: "teacherId must be a valid number" })
    .int("teacherId must be an integer")
    .positive("teacherId must be a positive integer")
);

const DURATIONS = [
  "ONE_MONTH",
  "THREE_MONTHS",
  "SIX_MONTHS",
  "ONE_YEAR",
];

// Body sent by the "Confirm Payment" action. The duration is chosen by the
// user; price is snapshotted server-side from the teacher at confirm time.
const confirmPaymentSchema = z.object({
  teacherId: z
    .number({ error: "teacherId is required" })
    .int("teacherId must be an integer")
    .positive("teacherId must be a positive integer"),
  duration: z
    .enum(DURATIONS, {
      error: `duration must be one of: ${DURATIONS.join(", ")}`,
    }),
});

const subscriptionIdParam = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === "") return undefined;
    return typeof value === "number" ? value : Number(value);
  },
  z
    .number({ error: "subscriptionId must be a valid number" })
    .int("subscriptionId must be an integer")
    .positive("subscriptionId must be a positive integer")
);

const webhookSchema = z.object({
  teacherId: z
    .number({ error: "teacherId is required" })
    .int("teacherId must be an integer")
    .positive("teacherId must be a positive integer"),
  duration: z
    .enum(DURATIONS, {
      error: `duration must be one of: ${DURATIONS.join(", ")}`,
    }),
  studentId: z
    .number({ error: "studentId must be a valid number" })
    .int("studentId must be an integer")
    .positive("studentId must be a positive integer")
    .optional(),
});

module.exports = { teacherIdParam, subscriptionIdParam, confirmPaymentSchema, webhookSchema, DURATIONS };
