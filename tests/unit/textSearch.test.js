const { normalizeForMatch, levenshtein } = require("../../src/utils/textSearch");

describe("textSearch - normalizeForMatch", () => {
  it("lowercases and trims", () => {
    expect(normalizeForMatch("  Ahmed  ")).toBe("ahmed");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeForMatch("Ahmed   Ali")).toBe("ahmed ali");
  });

  it("strips accent marks", () => {
    expect(normalizeForMatch("Café")).toBe("cafe");
    expect(normalizeForMatch("José")).toBe("jose");
  });

  it("handles non-string input", () => {
    expect(normalizeForMatch(42)).toBe("42");
    expect(normalizeForMatch(null)).toBe("null");
  });
});

describe("textSearch - levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("alpha", "alpha")).toBe(0);
  });

  it("counts one substitution", () => {
    expect(levenshtein("alpha", "alpa")).toBe(1);
  });

  it("counts insertions into an empty string as its length", () => {
    expect(levenshtein("", "ahmed")).toBe(5);
    expect(levenshtein("ahmed", "")).toBe(5);
  });

  it("computes a standard distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles completely different strings", () => {
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});