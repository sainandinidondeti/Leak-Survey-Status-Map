/* Turns GeoJSON features into pipeline records and works out each record's survey status.
   No DOM or map code here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./surveyDates'), require('./geometry'));
  else root.Status = factory(root.SurveyDates, root.Geometry);
})(typeof self !== 'undefined' ? self : this, function (SurveyDates, Geometry) {

  const AREA_TO_RULE_KEY = { business: 'businessDistrict', outside: 'outsideBusinessDistrict' };

  /* Read the FeatureCollection. Returns { districtPolygons, records, notes }.
     Nothing is silently dropped: every unusual feature produces a note or a record with issues. */
  function buildRecords(geojson, config) {
    const districtPolygons = [], records = [], notes = [];
    const features = geojson && Array.isArray(geojson.features) ? geojson.features : [];
    if (!features.length) notes.push('The GeoJSON contains no features.');

    features.forEach((feature, index) => {
      const props = (feature && feature.properties) || {};
      const geom = feature && feature.geometry;

      if (props.zone === config.businessDistrictZoneValue) {
        if (geom && geom.type === 'Polygon' && Array.isArray(geom.coordinates)) districtPolygons.push(geom.coordinates);
        else if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) districtPolygons.push(...geom.coordinates);
        else notes.push('Feature #' + (index + 1) + ' is marked as business district but has no usable polygon geometry.');
        return;
      }
      if (!props.segment_id) {
        notes.push('Feature #' + (index + 1) + ' has no segment_id and no business-district zone; it was not treated as a pipeline.');
        return;
      }
      records.push({
        id: String(props.segment_id),
        name: props.name || '(no name)',
        lastSurveyRaw: props.last_leak_survey === undefined ? null : props.last_leak_survey,
        geometry: geom,
        coordinates: null,   // filled only when the geometry is valid
        issues: []
      });
    });

    if (!districtPolygons.length) notes.push('No business district polygon found: every valid pipeline will be classified as outside.');

    // Geometry validation and area classification happen once, before any status maths.
    records.forEach(rec => {
      const check = Geometry.validateLineString(rec.geometry);
      rec.geometryValid = check.valid;
      rec.area = null; rec.relation = null;
      if (!check.valid) { rec.issues.push('Invalid geometry: ' + check.reason + ' It cannot be drawn or classified.'); return; }
      rec.coordinates = rec.geometry.coordinates;
      const cls = Geometry.classifyLine(rec.coordinates, districtPolygons);
      rec.area = cls.area; rec.relation = cls.relation;
      if (cls.relation === 'crossing') rec.issues.push('Crosses or touches the business district boundary; classified as business district (conservative rule).');
    });
    return { districtPolygons, records, notes };
  }

  /* Evaluate one record against an "as of" ISO date.
     Returns { status, nextDue, rule, daysUntilDue, reasons[] } and never throws. */
  function evaluate(record, asOfISO, config) {
    const result = { status: 'unknown', nextDue: null, rule: null, lastSurvey: null, daysUntilDue: null, reasons: [] };
    const asOf = SurveyDates.parseISODate(asOfISO);
    if (!asOf) { result.reasons.push('The "as of" date is invalid.'); return result; }

    const missing = record.lastSurveyRaw === null || record.lastSurveyRaw === '';
    const last = missing ? null : SurveyDates.parseISODate(record.lastSurveyRaw);
    if (missing) result.reasons.push('Last survey date is missing; no date was invented.');
    else if (!last) result.reasons.push('Last survey date "' + record.lastSurveyRaw + '" is not a valid YYYY-MM-DD date.');
    else result.lastSurvey = SurveyDates.toISO(last);

    if (!record.geometryValid) result.reasons.push('Geometry is invalid, so business-district status cannot be determined.');
    if (!last || !record.geometryValid) return result;

    const rule = config.rules[AREA_TO_RULE_KEY[record.area]];
    result.rule = rule;
    const calc = SurveyDates.computeNextDue(last, rule);
    result.nextDue = SurveyDates.toISO(calc.due);
    result.bindingConstraint = calc.bindingConstraint;
    result.daysUntilDue = SurveyDates.daysBetween(asOf, calc.due);

    if (SurveyDates.daysBetween(last, asOf) < 0) result.reasons.push('Last survey date is after the "as of" date; status calculated anyway.');
    if (result.daysUntilDue < 0) result.status = 'overdue';
    else if (result.daysUntilDue <= config.amberWarningDays) result.status = 'due_soon';
    else result.status = 'ok';
    return result;
  }

  return { buildRecords, evaluate };
});
