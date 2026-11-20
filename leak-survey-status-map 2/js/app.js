/* Dashboard UI: loads data, holds state, updates the page. Calculations live in status.js etc. */
(function () {
  const $ = id => document.getElementById(id);
  const state = { config: null, districtPolygons: [], records: [], notes: [], asOf: SurveyDates.todayISO(), filter: 'all', firstDraw: true };

  function esc(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
  function showError(message) { const box = $('error-box'); box.textContent = message; box.hidden = false; }

  function evaluateAll() {
    return state.records.map(record => ({ record, result: Status.evaluate(record, state.asOf, state.config) }));
  }

  function popupHtml(record, result) {
    const area = record.area ? (record.area === 'business' ? 'Business district' : 'Outside business district') : 'Unknown (invalid geometry)';
    const reg = result.rule ? result.rule.citation + ' (' + result.rule.label + ')' : 'Not determined';
    const extra = record.issues.concat(result.reasons).map(t => '<li>' + esc(t) + '</li>').join('');
    return '<div class="popup"><h3>' + esc(record.id) + ' – ' + esc(record.name) + '</h3><dl>' +
      '<dt>Last survey</dt><dd>' + esc(result.lastSurvey || 'Not available') + '</dd>' +
      '<dt>Next due</dt><dd>' + esc(result.nextDue || 'Cannot be calculated') + '</dd>' +
      '<dt>Location</dt><dd>' + esc(area) + '</dd>' +
      '<dt>Regulation</dt><dd>' + esc(reg) + '</dd>' +
      '<dt>Status</dt><dd><span class="badge ' + result.status + '">' + esc(state.config.statusLabels[result.status]) + '</span></dd></dl>' +
      (extra ? '<ul class="notes">' + extra + '</ul>' : '') + '</div>';
  }

  function render() {
    const all = evaluateAll();
    const counts = { ok: 0, due_soon: 0, overdue: 0, unknown: 0 };
    all.forEach(x => counts[x.result.status]++);

    $('count-total').textContent = all.length;
    Object.keys(counts).forEach(k => { $('count-' + k).textContent = counts[k]; $('legend-count-' + k).textContent = counts[k]; });

    renderOverdue(all.filter(x => x.result.status === 'overdue'));
    renderIssues(all);

    const visible = all.filter(x => state.filter === 'all' || x.result.status === state.filter);
    try {
      MapView.drawSegments(visible, state.config.statusColors, () => {}, popupHtml);
      if (state.firstDraw) { MapView.fitAll(); state.firstDraw = false; }
    } catch (err) {   // a map problem must never stop the dashboard from updating
      console.error('Map drawing failed:', err);
      showError('The map could not be drawn (' + err.message + '). The cards and lists are still correct.');
    }
    $('map-summary').textContent = 'Showing ' + visible.filter(x => x.record.geometryValid).length + ' of ' +
      all.filter(x => x.record.geometryValid).length + ' drawable pipelines. Zoom in or click a line to see details.';
  }

  function renderOverdue(overdue) {
    const list = $('overdue-list');
    $('export-csv').disabled = overdue.length === 0;
    if (!overdue.length) { list.innerHTML = '<li class="empty">No overdue pipelines as of ' + esc(state.asOf) + '.</li>'; return; }
    overdue.sort((a, b) => a.result.daysUntilDue - b.result.daysUntilDue);
    list.innerHTML = overdue.map(({ record, result }) =>
      '<li><button type="button" data-id="' + esc(record.id) + '"><strong>' + esc(record.id) + '</strong> ' + esc(record.name) +
      '<span>Due ' + esc(result.nextDue) + ' · ' + (-result.daysUntilDue) + ' days overdue</span></button></li>').join('');
  }

  // Every record with a problem is shown here, so nothing is silently hidden.
  function renderIssues(all) {
    const items = [];
    state.notes.forEach(n => items.push('<li>' + esc(n) + '</li>'));
    all.forEach(({ record, result }) => {
      const reasons = record.issues.concat(result.reasons);
      if (reasons.length) items.push('<li><strong>' + esc(record.id) + '</strong> ' + esc(record.name) + '<ul>' +
        reasons.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></li>');
    });
    $('issues-list').innerHTML = items.length ? items.join('') : '<li class="empty">No data issues found.</li>';
  }

  function exportCsv() {
    const overdue = evaluateAll().filter(x => x.result.status === 'overdue');
    const blob = new Blob([Csv.buildOverdueCsv(overdue, state.asOf)], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'overdue-pipelines-' + state.asOf + '.csv';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // The standalone HTML embeds config + GeoJSON, so it works by double-click with no server.
  async function loadJson(url) {
    const key = url.indexOf('config') === 0 ? 'config' : 'geojson';
    if (window.EMBEDDED_DATA && window.EMBEDDED_DATA[key]) return JSON.parse(JSON.stringify(window.EMBEDDED_DATA[key]));
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(url + ' returned HTTP ' + response.status);
    return response.json();
  }

  async function start() {
    try {
      if (typeof L === 'undefined') throw new Error('The Leaflet library did not load. Check your internet connection (it is loaded from a CDN).');
      state.config = await loadJson('config.json');
      // The amber label is built from the config so the 60 days is never hardcoded in the page.
      const amberLabel = 'Due within ' + state.config.amberWarningDays + ' days';
      state.config.statusLabels.due_soon = amberLabel;
      $('legend-label-due_soon').textContent = 'Survey ' + amberLabel.toLowerCase();
      $('filter-option-due_soon').textContent = amberLabel;
      const geojson = await loadJson('maple_falls_segments.geojson');
      const built = Status.buildRecords(geojson, state.config);
      Object.assign(state, built);
      MapView.init('map', () => showError('Map background tiles could not be loaded (the tile server may be blocking this page). Pipelines, statuses and lists are still correct. To get the map background, run "python3 serve.py" and open http://localhost:8080.'));
      MapView.drawDistrict(state.districtPolygons);
    } catch (err) {
      showError('Could not start the app: ' + err.message + ' If you opened index.html by double-clicking, run a local server instead (see README).');
      return;
    }

    $('asof-date').value = state.asOf;
    $('asof-date').addEventListener('change', e => {
      if (!SurveyDates.parseISODate(e.target.value)) { showError('Please choose a valid "as of" date.'); e.target.value = state.asOf; return; }
      $('error-box').hidden = true; state.asOf = e.target.value; render();
    });
    $('asof-today').addEventListener('click', () => { state.asOf = SurveyDates.todayISO(); $('asof-date').value = state.asOf; render(); });
    $('status-filter').addEventListener('change', e => { state.filter = e.target.value; render(); });
    $('fit-all').addEventListener('click', () => MapView.fitAll());
    $('fit-district').addEventListener('click', () => MapView.fitDistrict());
    $('export-csv').addEventListener('click', exportCsv);
    $('overdue-list').addEventListener('click', e => {
      const button = e.target.closest('button[data-id]');
      if (button) { $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); MapView.focus(button.dataset.id); }
    });
    ['ok', 'due_soon', 'overdue', 'unknown'].forEach(k => document.documentElement.style.setProperty('--c-' + k, state.config.statusColors[k]));
    render();
    window.addEventListener('load', () => MapView.fitAll());   // re-fit once fonts/layout have settled
  }
  document.addEventListener('DOMContentLoaded', start);
})();
