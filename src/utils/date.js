// Calendar-based month arithmetic (correct handling of month-end overflow),
// e.g. addMonths(date, 3) for a 3-month plan. Not a fixed-day-count addition.
function addMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDayOfMonth = new Date(
    result.getFullYear(),
    result.getMonth() + 1,
    0
  ).getDate();
  result.setDate(Math.min(day, lastDayOfMonth));
  return result;
}

// Map a subscription duration enum to its calendar-based month offset.
const DURATION_MONTHS = {
  ONE_MONTH: 1,
  THREE_MONTHS: 3,
  SIX_MONTHS: 6,
  ONE_YEAR: 12,
};

function durationToMonths(duration) {
  return DURATION_MONTHS[duration] || 1;
}

function endDateForStartDuration(startDate, duration) {
  return addMonths(startDate, durationToMonths(duration));
}

module.exports = {
  addMonths,
  durationToMonths,
  endDateForStartDuration,
  DURATION_MONTHS,
};
