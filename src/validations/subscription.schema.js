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

module.exports = { teacherIdParam, confirmPaymentSchema, DURATIONS };
