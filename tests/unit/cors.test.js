const {
  DEV_ORIGINS,
  resolveCorsOrigins,
  buildCorsOptions,
} = require("../../src/config/cors");

function decide(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

describe("cors configuration", () => {
  it("supports the documented development origins", () => {
    expect(DEV_ORIGINS).toContain("http://localhost:3000");
    expect(DEV_ORIGINS).toContain("http://127.0.0.1:3000");
    const origins = resolveCorsOrigins({ NODE_ENV: "development", CORS_ORIGINS: "" });
    expect(origins).toEqual(expect.arrayContaining(DEV_ORIGINS));
  });

  it("keeps an explicit allowlist when configured", () => {
    const origins = resolveCorsOrigins({
      NODE_ENV: "development",
      CORS_ORIGINS: "https://a.example.com, https://b.example.com",
    });
    expect(origins).toEqual(["https://a.example.com", "https://b.example.com"]);
  });

  it("refuses to boot with missing production configuration", () => {
    expect(() => resolveCorsOrigins({ NODE_ENV: "production", CORS_ORIGINS: "" })).toThrow(
      /CORS_ORIGINS/
    );
  });

  it("allows configured origins and denies others without reflection", async () => {
    const options = buildCorsOptions(["https://a.example.com"]);
    expect(await decide(options, "https://a.example.com")).toBe(true);
    expect(await decide(options, "https://evil.example.com")).toBe(false);
    expect(await decide(options, undefined)).toBe(true);
    expect(options.credentials).toBe(true);
  });
});
