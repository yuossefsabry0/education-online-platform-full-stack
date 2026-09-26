const { success, error } = require("../../src/utils/apiResponse");

function mockRes() {
  const res = {
    _status: 200,
    _body: null,
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

describe("apiResponse - success", () => {
  it("returns the Task-1 wrapper with success:true", () => {
    const res = mockRes();
    success(res, { a: 1 });
    expect(res._status).toBe(200);
    expect(res._body).toEqual({ success: true, data: { a: 1 }, error: null });
  });

  it("honours a custom status code", () => {
    const res = mockRes();
    success(res, { a: 1 }, 201);
    expect(res._status).toBe(201);
  });

  it("defaults data to null when omitted", () => {
    const res = mockRes();
    success(res);
    expect(res._body.data).toBeNull();
    expect(res._body.error).toBeNull();
  });
});

describe("apiResponse - error", () => {
  it("returns the wrapper with success:false and data:null", () => {
    const res = mockRes();
    error(res, "Something broke", 500, "INTERNAL_ERROR", "stack");
    expect(res._status).toBe(500);
    expect(res._body).toEqual({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR", message: "Something broke", details: "stack" },
    });
  });

  it("uses sensible defaults", () => {
    const res = mockRes();
    error(res);
    expect(res._status).toBe(500);
    expect(res._body.error.code).toBe("ERROR");
    expect(res._body.error.message).toBe("Something went wrong");
    expect(res._body.error.details).toBeNull();
  });
});