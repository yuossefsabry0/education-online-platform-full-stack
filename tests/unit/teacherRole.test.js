const { deriveTeacherRole } = require("../../src/utils/teacherRole");

describe("teacherRole util", () => {
  it("derives the role SUB{teacherId} dynamically", () => {
    expect(deriveTeacherRole(1)).toBe("SUB1");
    expect(deriveTeacherRole(42)).toBe("SUB42");
  });

  it("is purely derived from the id - no role list to keep in sync", () => {
    // Any new teacher automatically gets a unique role without code changes.
    expect(deriveTeacherRole(999999)).toBe("SUB999999");
  });
});