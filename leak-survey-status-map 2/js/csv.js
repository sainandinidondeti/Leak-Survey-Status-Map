/* CSV export of overdue pipelines. Cells are quoted, and cells starting with = + - @ get a
   leading apostrophe so spreadsheet apps cannot run them as formulas. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Csv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function cell(value) {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  // rows = [{record, result}] already filtered to overdue
  function buildOverdueCsv(rows, asOfISO) {
    const header = ['Pipeline ID', 'Name', 'Last survey date', 'Next survey due date', 'Days overdue', 'Area', 'Applicable regulation', 'As of date'];
    const lines = rows.map(({ record, result }) => [
      record.id, record.name, result.lastSurvey, result.nextDue, -result.daysUntilDue,
      result.rule.label, result.rule.citation, asOfISO].map(cell).join(','));
    return [header.map(cell).join(',')].concat(lines).join('\r\n') + '\r\n';
  }
  return { buildOverdueCsv };
});
