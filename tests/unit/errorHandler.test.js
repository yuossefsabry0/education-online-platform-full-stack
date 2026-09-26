// Unit tests for the centralized error-handling middleware: it must always
// respond with the same { success: false, data: null, error: {...} } shape no
// matter what kind of error bubbles up (plain errors, Prisma errors, JSON
// parsing errors).
const { Prisma } = require("@prisma/client");
const { errorHandler, notFoundHandler } = require("../../src/middlewares/errorHandler");

function mockRes() {
  const res = {
    _status: 200,
    _body: null,
    headersSent: false,
    status(status) {
      res._status = status;
      return res;
    },
    json(body) {
      res._body = body;
      return res;
    },
  };
  return res;
}

describe("errorHandler - generic errors", () => {
  it("maps a plain thrown error to 500 INTERNAL_ERROR without leaking the message", () => {
    const res = mockRes();
    errorHandler(new Error("secret db trace"), {}, res, () => {});
    expect(res._status).toBe(500);
    expect(res._body.success).toBe(false);
    expect(res._body.error.code).toBe("INTERNAL_ERROR");
    expect(res._body.error.message).toBe("Internal server error");
  });

  it("preserves controller-thrown statuses and codes", () => {
    const err = new Error("Teacher not found");
    err.status = 404;
    err.code = "TEACHER_NOT_FOUND";
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._status).toBe(404);
    expect(res._body.error.code).toBe("TEACHER_NOT_FOUND");
    expect(res._body.error.message).toBe("Teacher not found");
  });

  it("passes along custom validation details", () => {
    const err = new Error("Validation failed");
    err.status = 400;
    err.code = "VALIDATION_ERROR";
    err.details = [{ field: "email", message: "Invalid" }];
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._body.error.details).toEqual([{ field: "email", message: "Invalid" }]);
  });

  it("delegates to next() once headers are already sent", () => {
    const res = mockRes();
    res.headersSent = true;
    const next = jest.fn();
    errorHandler(new Error("boom"), {}, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._body).toBeNull();
  });
});

describe("errorHandler - Prisma errors", () => {
  it("maps P2002 duplicate to 409 DUPLICATE_FIELD", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["username"] },
    });
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._status).toBe(409);
    expect(res._body.error.code).toBe("DUPLICATE_FIELD");
    expect(res._body.error.details.fields).toEqual(["username"]);
  });

  it("maps P2025 not-found to 404 NOT_FOUND", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Record missing", {
      code: "P2025",
      clientVersion: "test",
    });
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._status).toBe(404);
    expect(res._body.error.code).toBe("NOT_FOUND");
  });
});

describe("errorHandler - body parsing errors", () => {
  it("maps malformed JSON to 400 INVALID_JSON", () => {
    const err = new Error("Unexpected end of JSON input");
    err.type = "entity.parse.failed";
    err.status = 400;
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.error.code).toBe("INVALID_JSON");
  });

  it("maps oversized payloads to 413 PAYLOAD_TOO_LARGE", () => {
    const err = new Error("request entity too large");
    err.type = "entity.too.large";
    err.status = 413;
    const res = mockRes();
    errorHandler(err, {}, res, () => {});
    expect(res._status).toBe(413);
    expect(res._body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

describe("notFoundHandler", () => {
  it("returns the wrapper for unmatched routes", () => {
    const res = mockRes();
    notFoundHandler({ originalUrl: "/api/x" }, res);
    expect(res._status).toBe(404);
    expect(res._body.success).toBe(false);
    expect(res._body.error.code).toBe("NOT_FOUND");
  });
});