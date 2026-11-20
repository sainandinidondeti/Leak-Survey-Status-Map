// Run with:  node tests/run-tests.js      (no installs needed)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const SD = require('../js/surveyDates');
const G = require('../js/geometry');
const S = require('../js/status');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));
const geojson = JSON.parse(fs.readFileSync(path.join(__dirname, '../maple_falls_segments.geojson'), 'utf8'));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { failed++; console.log('  FAIL  ' + name + '\n        ' + e.message); }
}
const due = (last, key) => SD.toISO(SD.computeNextDue(SD.parseISODate(last), config.rules[key]).due);
const BD = 'businessDistrict', OUT = 'outsideBusinessDistrict';

console.log('Date parsing and arithmetic');
test('rejects impossible / malformed dates', () => {
  ['2026-02-30', '2026-13-01', 'abc', '', null, undefined, '2026/01/01', 20260101].forEach(v => assert.strictEqual(SD.parseISODate(v), null, String(v)));
});
test('accepts leap day', () => assert.deepStrictEqual(SD.parseISODate('2024-02-29'), { y: 2024, m: 2, d: 29 }));
test('addMonths clamps to end of month', () => {
  assert.strictEqual(SD.toISO(SD.addMonths(SD.parseISODate('2026-01-31'), 15)), '2027-04-30');
  assert.strictEqual(SD.toISO(SD.addMonths(SD.parseISODate('2024-02-29'), 12)), '2025-02-28');
});
test('daysBetween', () => assert.strictEqual(SD.daysBetween(SD.parseISODate('2026-11-15'), SD.parseISODate('2026-12-31')), 46));

console.log('Due dates (both regulations)');
test('BD: 15-month limit binds early in the year (2025-01-15 -> 2026-04-15)', () => assert.strictEqual(due('2025-01-15', BD), '2026-04-15'));
test('BD: calendar-year limit binds late in the year (2025-12-10 -> 2026-12-31)', () => assert.strictEqual(due('2025-12-10', BD), '2026-12-31'));
test('BD: 2025-08-20 -> 2026-11-20 (15 months < 31 Dec 2026)', () => assert.strictEqual(due('2025-08-20', BD), '2026-11-20'));
test('BD: survey on 31 Dec -> 31 Dec next year', () => assert.strictEqual(due('2025-12-31', BD), '2026-12-31'));
test('BD: 2026-01-31 -> 2027-04-30', () => assert.strictEqual(due('2026-01-31', BD), '2027-04-30'));
test('Outside: 63-month limit binds (2021-01-20 -> 2026-04-20)', () => assert.strictEqual(due('2021-01-20', OUT), '2026-04-20'));
test('Outside: 2021-09-10 -> 2026-12-10', () => assert.strictEqual(due('2021-09-10', OUT), '2026-12-10'));
test('Outside: 2022-03-01 -> 2027-06-01', () => assert.strictEqual(due('2022-03-01', OUT), '2027-06-01'));
test('Outside: calendar-year limit binds when survey is late in year (2021-11-30 -> 2026-12-31; 63 months would be 2027-02-28)', () => assert.strictEqual(due('2021-11-30', OUT), '2026-12-31'));

console.log('Geometry handling');
const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
test('line fully inside', () => assert.strictEqual(G.classifyLine([[2, 2], [5, 5]], [square]).relation, 'inside'));
test('line fully outside', () => assert.strictEqual(G.classifyLine([[20, 20], [30, 30]], [square]).relation, 'outside'));
test('line crossing boundary -> business', () => { const r = G.classifyLine([[5, 5], [20, 5]], [square]); assert.deepStrictEqual([r.area, r.relation], ['business', 'crossing']); });
test('line passing through with both ends outside -> business', () => assert.strictEqual(G.classifyLine([[-5, 5], [20, 5]], [square]).area, 'business'));
test('line only touching the boundary -> business (conservative)', () => assert.strictEqual(G.classifyLine([[10, 5], [20, 5]], [square]).area, 'business'));
test('rejects 1-point, empty, wrong-type, NaN geometry without throwing', () => {
  [{ type: 'LineString', coordinates: [[1, 1]] }, { type: 'LineString', coordinates: [] }, { type: 'Point', coordinates: [1, 1] },
   { type: 'LineString', coordinates: [[1, 1], [NaN, 2]] }, null, undefined].forEach(g => assert.strictEqual(G.validateLineString(g).valid, false));
});

console.log('Full dataset at as-of 2026-11-15');
const { records, notes } = S.buildRecords(geojson, config);
const results = Object.fromEntries(records.map(r => [r.id, { rec: r, ev: S.evaluate(r, '2026-11-15', config) }]));
// Expected values worked out by hand from the regulation text, independent of the code.
const expected = {
  S01: ['business', '2026-04-15', 'overdue'], S02: ['business', '2026-12-31', 'due_soon'], S03: ['business', '2027-09-01', 'ok'],
  S04: ['outside', '2027-06-01', 'ok'], S05: ['outside', '2026-04-20', 'overdue'], S06: ['outside', '2026-12-10', 'due_soon'],
  S07: ['business', '2026-11-20', 'due_soon'], S08: ['outside', null, 'unknown'], S09: [null, null, 'unknown'], S10: ['business', '2027-04-30', 'ok']
};
test('all 10 records present, plus 1 district polygon', () => { assert.strictEqual(records.length, 10); assert.strictEqual(notes.length, 0); });
Object.entries(expected).forEach(([id, [area, nextDue, status]]) => test(id + ' -> ' + [area, nextDue, status].join(', '), () => {
  assert.strictEqual(results[id].rec.area, area); assert.strictEqual(results[id].ev.nextDue, nextDue); assert.strictEqual(results[id].ev.status, status);
}));
test('S07 flagged as crossing', () => assert.strictEqual(results.S07.rec.relation, 'crossing'));
test('S09 invalid geometry, not drawable; S08 no invented date', () => {
  assert.strictEqual(results.S09.rec.geometryValid, false); assert.strictEqual(results.S08.ev.lastSurvey, null);
});
test('exactly 9 valid geometries', () => assert.strictEqual(records.filter(r => r.geometryValid).length, 9));
test('status counts: 3 ok, 3 due_soon, 2 overdue, 2 unknown', () => {
  const c = {}; Object.values(results).forEach(x => c[x.ev.status] = (c[x.ev.status] || 0) + 1);
  assert.deepStrictEqual(c, { overdue: 2, due_soon: 3, ok: 3, unknown: 2 });
});
test('changing as-of date changes statuses', () => {
  assert.strictEqual(S.evaluate(results.S02.rec, '2026-12-31', config).status, 'due_soon');   // due day itself is not overdue
  assert.strictEqual(S.evaluate(results.S02.rec, '2027-01-01', config).status, 'overdue');
  assert.strictEqual(S.evaluate(results.S02.rec, '2026-11-01', config).status, 'due_soon');   // exactly 60 days out -> amber
  assert.strictEqual(S.evaluate(results.S02.rec, '2026-10-31', config).status, 'ok');         // 61 days out -> still green
});
test('invalid as-of date does not throw', () => assert.strictEqual(S.evaluate(results.S01.rec, 'garbage', config).status, 'unknown'));
test('bad/empty GeoJSON does not throw', () => { S.buildRecords(null, config); S.buildRecords({ features: [null, {}] }, config); });
test('invalid last-survey date string -> unknown', () => {
  const r = Object.assign({}, results.S01.rec, { lastSurveyRaw: '2025-02-30' });
  assert.strictEqual(S.evaluate(r, '2026-11-15', config).status, 'unknown');
});

console.log('CSV export');
const Csv = require('../js/csv');
test('CSV has header + 2 overdue rows (S01, S05), quoted and CRLF', () => {
  const rows = Object.values(results).filter(x => x.ev.status === 'overdue').map(x => ({ record: x.rec, result: x.ev }));
  const lines = Csv.buildOverdueCsv(rows, '2026-11-15').trim().split('\r\n');
  assert.strictEqual(lines.length, 3);
  assert.ok(lines[1].startsWith('"S01","Main St 4in steel","2025-01-15","2026-04-15","214"'), lines[1]);
});
test('CSV neutralises formulas and escapes quotes', () => {
  const rec = { id: 'X', name: '=HYPERLINK("x")' }, res = { lastSurvey: '2020-01-01', nextDue: '2021-01-01', daysUntilDue: -1, rule: config.rules[BD] };
  const out = Csv.buildOverdueCsv([{ record: rec, result: res }], '2026-11-15');
  assert.ok(out.includes('"\'=HYPERLINK(""x"")"'), out);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
