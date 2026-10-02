const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const {
  logger,
  LOG_FILE,
  LOG_MAX_BYTES,
  LOG_RETAINED_FILES,
  rotateCombinedLogs,
  appendLine,
} = require("../../src/utils/logger");

async function waitFor(fn, timeoutMs) {
  const start = Date.now();
  for (;;) {
    try {
      fn();
      return;
    } catch (err) {
      if (Date.now() - start > (timeoutMs || 5000)) throw err;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

describe("file logging", () => {
  it("writes normal entries without blocking the caller", async () => {
    const marker = `t2-normal-${Date.now()}`;
    logger.info(marker, { ip: "127.0.0.1" });
    await waitFor(() => {
      expect(fs.readFileSync(LOG_FILE, "utf8")).toContain(marker);
    });
  });

  it("captures error stacks", async () => {
    const marker = `t2-error-${Date.now()}`;
    logger.error(marker, { stack: "Error: boom\n    at t2" });
    await waitFor(() => {
      expect(fs.readFileSync(LOG_FILE, "utf8")).toContain("Error: boom");
    });
  });

  it("caps retained files at the documented limit", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "t2logs-"));
    await fs.promises.writeFile(path.join(dir, "combined.log"), "x".repeat(LOG_MAX_BYTES + 8));
    for (let i = 1; i <= LOG_RETAINED_FILES; i += 1) {
      await fs.promises.writeFile(path.join(dir, `combined.${i}.log`), `old-${i}`);
    }
    await rotateCombinedLogs(dir);
    const entries = (await fs.promises.readdir(dir)).filter((n) => n.startsWith("combined."));
    expect(entries).not.toContain("combined.log");
    expect(entries.filter((n) => n !== "combined.log").length).toBe(LOG_RETAINED_FILES);
    expect(await fs.promises.readFile(path.join(dir, "combined.1.log"), "utf8").then((s) => s.length)).toBeGreaterThan(LOG_MAX_BYTES);
    await fs.promises.rm(dir, { recursive: true, force: true });
  });

  it("never breaks request handling when writes fail", async () => {
    const spy = jest.spyOn(fs.promises, "appendFile").mockRejectedValue(new Error("disk full"));
    try {
      await expect(appendLine("/nonexistent-dir/x.log", "line\n")).resolves.toBeUndefined();
      const app = require("../../src/app");
      await request(app).get("/api/health").expect(200);
    } finally {
      spy.mockRestore();
    }
  });
});
