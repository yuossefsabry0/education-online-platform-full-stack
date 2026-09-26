const { z } = require("zod");

const CONTENT_TYPES = ["LECTURE", "LESSON_CONTENT", "HOMEWORK"];

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
  fileUrl: z
    .string()
    .max(500, "fileUrl must be at most 500 characters")
    .optional(),
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
  fileUrl: z
    .string()
    .max(500, "fileUrl must be at most 500 characters")
    .optional()
    .nullable(),
  isPublished: z.boolean().optional(),
});

module.exports = { addContentSchema, editContentSchema, CONTENT_TYPES };
