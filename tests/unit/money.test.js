const { toMoneyString } = require("../../src/utils/money");

describe("money serialization", () => {
  it("formats positive income with exactly 2 decimals", () => {
    expect(toMoneyString(60)).toBe("60.00");
    expect(toMoneyString("123.4")).toBe("123.40");
    expect(toMoneyString(162.5)).toBe("162.50");
  });

  it("formats zero income as 2-decimal string", () => {
    expect(toMoneyString(0)).toBe("0.00");
    expect(toMoneyString("0")).toBe("0.00");
  });

  it("maps null aggregates to 0.00", () => {
    expect(toMoneyString(null)).toBe("0.00");
    expect(toMoneyString(undefined)).toBe("0.00");
  });
});
