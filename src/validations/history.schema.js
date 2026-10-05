const { z } = require("zod");

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

const historyQuerySchema = z.object({
  page: intParam(1, 1_000_000).default(1),
  limit: intParam(1, 50).default(10),
  subPage: intParam(1, 1_000_000).optional(),
  eventPage: intParam(1, 1_000_000).optional(),
});

module.exports = { historyQuerySchema };
