const { z } = require("zod");

const SORTABLE_FIELDS = [
  "id",
  "name",
  "subject",
  "gradeClass",
  "username",
  "email",
  "createdAt",
  "updatedAt",
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

const sorting = {
  sortBy: z.enum(SORTABLE_FIELDS).default("id"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
};

const pagination = {
  page: intParam(1, 1_000_000).default(1),
  limit: intParam(1, 100).default(10),
};

const listTeachersQuerySchema = z.object({
  ...pagination,
  ...sorting,
});

const searchTeachersQuerySchema = z.object({
  q: z
    .string({ error: "q must be a string" })
    .trim()
    .max(100, "Search text must be at most 100 characters")
    .default(""),
  ...pagination,
  ...sorting,
});

module.exports = { listTeachersQuerySchema, searchTeachersQuerySchema };