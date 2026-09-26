const { error } = require("../utils/apiResponse");

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return error(res, "Validation failed", 400, "VALIDATION_ERROR", details);
  }
  req.body = result.data;
  next();
};

module.exports = validate;
