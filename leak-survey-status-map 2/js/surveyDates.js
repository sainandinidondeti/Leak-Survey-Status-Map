/* Survey date calculations. Dates are plain "YYYY-MM-DD" strings handled in UTC,
   so the user's time zone can never shift a date by one day. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SurveyDates = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // Strictly parse "YYYY-MM-DD". Returns {y,m,d} or null (rejects 2026-02-30, "abc", null...).
  function parseISODate(text) {
    if (typeof text !== 'string') return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (!match) return null;
    const y = +match[1], m = +match[2], d = +match[3];
    const check = new Date(Date.UTC(y, m - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
    return { y, m, d };
  }

  function pad(n, width) { return String(n).padStart(width, '0'); }
  function toISO(date) { return pad(date.y, 4) + '-' + pad(date.m, 2) + '-' + pad(date.d, 2); }

  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

  // Add whole months. If the target month is shorter, clamp to its last day
  // (31 Jan 2026 + 15 months -> 30 Apr 2027).
  function addMonths(date, months) {
    const zeroBased = date.y * 12 + (date.m - 1) + months;
    const y = Math.floor(zeroBased / 12);
    const m = (zeroBased % 12) + 1;
    return { y, m, d: Math.min(date.d, daysInMonth(y, m)) };
  }

  function toUTCms(date) { return Date.UTC(date.y, date.m - 1, date.d); }

  // Whole days from a to b (positive if b is later).
  function daysBetween(a, b) { return Math.round((toUTCms(b) - toUTCms(a)) / 86400000); }

  // Today in the user's local calendar, as YYYY-MM-DD.
  function todayISO() {
    const now = new Date();
    return pad(now.getFullYear(), 4) + '-' + pad(now.getMonth() + 1, 2) + '-' + pad(now.getDate(), 2);
  }

  /* Next survey due date = the EARLIER of two deadlines:
       (a) last survey + maxIntervalMonths           ("intervals not exceeding N months")
       (b) 31 Dec of (last survey year + calendarYearsAllowed)   ("at least once each / every N calendar years")
     rule = { maxIntervalMonths, calendarYearsAllowed } from config.json */
  function computeNextDue(lastSurvey, rule) {
    const byInterval = addMonths(lastSurvey, rule.maxIntervalMonths);
    const byCalendar = { y: lastSurvey.y + rule.calendarYearsAllowed, m: 12, d: 31 };
    const intervalIsEarlier = toUTCms(byInterval) <= toUTCms(byCalendar);
    return {
      due: intervalIsEarlier ? byInterval : byCalendar,
      byInterval, byCalendar,
      bindingConstraint: intervalIsEarlier ? 'interval' : 'calendar-year'
    };
  }

  return { parseISODate, toISO, addMonths, daysBetween, todayISO, computeNextDue };
});
