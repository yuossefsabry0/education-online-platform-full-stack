const { isAcceptedFileUrl } = require("../../src/utils/fileUrl");

describe("fileUrl acceptance", () => {
  it("accepts https and http urls", () => {
    expect(isAcceptedFileUrl("https://media.example.com/a.mp4")).toBe(true);
    expect(isAcceptedFileUrl("http://media.example.com/a.mp4")).toBe(true);
    expect(isAcceptedFileUrl("https://media.example.com/".padEnd(500, "a"))).toBe(true);
  });

  it("rejects javascript scheme variants", () => {
    expect(isAcceptedFileUrl("javascript:alert(1)")).toBe(false);
    expect(isAcceptedFileUrl("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isAcceptedFileUrl("   javascript:alert(1)")).toBe(false);
  });

  it("rejects vbscript scheme variants", () => {
    expect(isAcceptedFileUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isAcceptedFileUrl("VBSCRIPT:msgbox(1)")).toBe(false);
    expect(isAcceptedFileUrl("   vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects malformed and relative values", () => {
    expect(isAcceptedFileUrl("not a url")).toBe(false);
    expect(isAcceptedFileUrl("/relative/path.mp4")).toBe(false);
    expect(isAcceptedFileUrl("uploads/file.mp4")).toBe(false);
    expect(isAcceptedFileUrl("")).toBe(false);
    expect(isAcceptedFileUrl(null)).toBe(false);
  });
});
