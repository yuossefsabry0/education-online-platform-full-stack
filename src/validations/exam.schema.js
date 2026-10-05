const { z } = require("zod");

const questionSchema = z.object({
  text: z
    .string({ error: "Question text is required" })
    .trim()
    .min(1, "Question text is required")
    .max(1000, "Question text must be at most 1000 characters"),
  options: z
    .array(
      z
        .string({ error: "Option text is required" })
        .trim()
        .min(1, "Option text cannot be empty")
        .max(500, "Option text must be at most 500 characters")
    )
    .min(2, "Each question needs at least 2 options")
    .max(6, "Each question can have at most 6 options"),
  correctIndex: z
    .number({ error: "Correct answer index is required" })
    .int("Correct answer index must be an integer")
    .min(0, "Correct answer index must be at least 0"),
});

const createExamSchema = z
  .object({
    title: z
      .string({ error: "Title is required" })
      .trim()
      .min(1, "Title is required")
      .max(255, "Title must be at most 255 characters"),
    lessonContentId: z
      .number({ error: "Lesson is required — select the lesson this exam belongs to" })
      .int("Lesson must be an integer id")
      .min(1, "Lesson is required — select the lesson this exam belongs to"),
    timeLimitSeconds: z
      .number({ error: "Time limit must be a number of seconds" })
      .int("Time limit must be whole seconds")
      .min(30, "Time limit must be at least 30 seconds")
      .max(7200, "Time limit must be at most 7200 seconds")
      .optional()
      .default(600),
    isPublished: z.boolean().optional().default(true),
    questions: z
      .array(questionSchema)
      .min(1, "An exam needs at least 1 question")
      .max(50, "An exam can have at most 50 questions"),
  })
  .refine(
    (data) =>
      data.questions.every((q) => q.correctIndex < q.options.length),
    { message: "Correct answer index must point to one of the options", path: ["questions"] }
  );

const updateExamSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Title cannot be empty")
    .max(255, "Title must be at most 255 characters")
    .optional(),
  lessonContentId: z
    .number({ error: "Lesson must be a valid content id" })
    .int("Lesson must be an integer id")
    .min(1, "Lesson must be a valid content id")
    .nullable()
    .optional(),
  timeLimitSeconds: z
    .number({ error: "Time limit must be a number of seconds" })
    .int("Time limit must be whole seconds")
    .min(30, "Time limit must be at least 30 seconds")
    .max(7200, "Time limit must be at most 7200 seconds")
    .optional(),
  isPublished: z.boolean().optional(),
});

const submitExamSchema = z.object({
  answers: z
    .array(
      z
        .number({ error: "Each answer must be an option index or null" })
        .int("Each answer must be a whole option index")
        .min(0, "Answer index must be at least 0")
        .nullable()
    )
    .max(50, "Too many answers")
    .optional()
    .default([]),
  timedOut: z.boolean().optional().default(false),
});

module.exports = { createExamSchema, updateExamSchema, submitExamSchema };
