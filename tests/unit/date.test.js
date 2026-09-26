const {
  addMonths,
  durationToMonths,
  endDateForStartDuration,
  DURATION_MONTHS,
} = require("../../src/utils/date");

// Format a date as YYYY-MM-DD using LOCAL components (the utils work on local
// calendar days, so assertions must not use UTC toISOString()).
function localDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

describe("date utils - addMonths", () => {
  it("adds whole months keeping the day", () => {
    expect(localDay(addMonths(new Date(2025, 0, 15), 3))).toBe("2025-04-15");
  });

  it("clamps day overflow (Jan 31 + 1 month -> Feb 28)", () => {
    expect(localDay(addMonths(new Date(2025, 0, 31), 1))).toBe("2025-02-28");
  });

  it("handles leap-year February (2024-01-31 + 1 month -> 2024-02-29)", () => {
    expect(localDay(addMonths(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
  });

  it("rolls over the year boundary", () => {
    expect(localDay(addMonths(new Date(2025, 10, 5), 2))).toBe("2026-01-05");
  });

  it("does not mutate the input date", () => {
    const input = new Date(2025, 5, 10);
    addMonths(input, 2);
    expect(localDay(input)).toBe("2025-06-10");
  });
});

describe("date utils - duration mapping", () => {
  it("maps every duration enum to its calendar months", () => {
    expect(DURATION_MONTHS).toEqual({
      ONE_MONTH: 1,
      THREE_MONTHS: 3,
      SIX_MONTHS: 6,
      ONE_YEAR: 12,
    });
  });

  it("falls back to 1 month for unknown values", () => {
    expect(durationToMonths("NOPE")).toBe(1);
  });
});

describe("date utils - endDateForStartDuration", () => {
  it("computes a calendar-based end date", () => {
    const start = new Date(2025, 0, 15);
    expect(endDateForStartDuration(start, "THREE_MONTHS").getMonth()).toBe(3);
    expect(localDay(endDateForStartDuration(start, "THREE_MONTHS"))).toBe("2025-04-15");
  });
});