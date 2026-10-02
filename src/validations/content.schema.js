const { z } = require("zod");
const { isAcceptedFileUrl } = require("../utils/fileUrl");

const CONTENT_TYPES = ["LECTURE", "LESSON_CONTENT", "HOMEWORK"];

const fileUrlField = z
  .string()
  .max(500, "fileUrl must be at most 500 characters")
  .refine((v) => isAcceptedFileUrl(v), {
    message: "fileUrl must be a valid http(s) URL or uploaded file path",
  })
  .optional();

const nullableFileUrlField = z
  .string()
  .max(500, "fileUrl must be at most 500 characters")
  .refine((v) => isAcceptedFileUrl(v), {
    message: "fileUrl must be a valid http(s) URL or uploaded file path",
  })
  .optional()
  .nullable();

const addContentSchema = z.object({
  type: z.enum(CONTENT_TYPES, {
    error: `type must be one of: ${CONTENT_TYPES.join(", ")}`,
  }),
  title: z
    .string({ error: "Title is required" })
    .min(1, "Title is required")
    .max(255, "Title must be at most 255 characters"),
  body: z
    .string()
    .max(65535, "Body must be at most 65535 characters")
    .optional(),
  fileUrl: fileUrlField,
  isPublished: z.boolean().optional().default(true),
});

const editContentSchema = z.object({
  type: z
    .enum(CONTENT_TYPES, {
      error: `type must be one of: ${CONTENT_TYPES.join(", ")}`,
    })
    .optional(),
  title: z
    .string()
    .min(1, "Title cannot be empty")
    .max(255, "Title must be at most 255 characters")
    .optional(),
  body: z
    .string()
    .max(65535, "Body must be at most 65535 characters")
    .optional(),
  fileUrl: nullableFileUrlField,
  isPublished: z.boolean().optional(),
});

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

const contentListQuerySchema = z.object({
  page: intParam(1, 1_000_000).default(1),
  limit: intParam(1, 50).default(10),
  q: z
    .string({ error: "q must be a string" })
    .trim()
    .max(100, "Search text must be at most 100 characters")
    .default(""),
});

module.exports = { addContentSchema, editContentSchema, CONTENT_TYPES, contentListQuerySchema };
