// Checks that the files agree with each other: every element id used in app.js exists in index.html,
// and every Module.method() call refers to a method that module really exports.
// Run with:  node tests/check-wiring.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
let problems = 0;
const fail = msg => { problems++; console.log('  FAIL  ' + msg); };

// 1) element ids
const html = read('index.html');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const app = read('js/app.js');
const used = new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]));
['ok', 'due_soon', 'overdue', 'unknown'].forEach(k => { used.add('count-' + k); used.add('legend-count-' + k); });   // built as 'count-' + k
used.forEach(id => { if (!htmlIds.has(id)) fail('app.js uses #' + id + ' but index.html has no such id'); });
const scripts = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]).filter(s => s.startsWith('js/'));
scripts.forEach(s => { if (!fs.existsSync(path.join(root, s))) fail('index.html loads missing file ' + s); });
fs.readdirSync(path.join(root, 'js')).forEach(f => { if (!scripts.includes('js/' + f)) fail('js/' + f + ' is not loaded by index.html'); });

// 2) Module.method() calls
const exportsOf = {
  SurveyDates: Object.keys(require('../js/surveyDates')), Geometry: Object.keys(require('../js/geometry')),
  Status: Object.keys(require('../js/status')), Csv: Object.keys(require('../js/csv')),
  MapView: (read('js/map.js').match(/return \{([^}]*)\}/g).pop().match(/\w+/g).slice(1))
};
fs.readdirSync(path.join(root, 'js')).forEach(file => {
  const src = read('js/' + file);
  Object.keys(exportsOf).forEach(mod => {
    for (const m of src.matchAll(new RegExp('\\b' + mod + '\\.(\\w+)\\(', 'g')))
      if (!exportsOf[mod].includes(m[1])) fail(file + ' calls ' + mod + '.' + m[1] + '() which does not exist');
  });
});
console.log(problems ? '\n' + problems + ' wiring problem(s)' : '  PASS  all element ids, script files and Module.method() calls line up');
process.exit(problems ? 1 : 0);
