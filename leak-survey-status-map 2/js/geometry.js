/* Geometry validation and business-district classification.
   Coordinates follow GeoJSON order: [longitude, latitude]. Pure functions, no map code. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Geometry = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function isValidCoordinate(c) {
    return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) &&
      Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
  }

  // A usable pipeline must be a LineString with >= 2 valid coordinates.
  function validateLineString(geometry) {
    if (!geometry || typeof geometry !== 'object') return { valid: false, reason: 'Geometry is missing.' };
    if (geometry.type !== 'LineString') return { valid: false, reason: 'Geometry type is "' + geometry.type + '", expected LineString.' };
    const coords = geometry.coordinates;
    if (!Array.isArray(coords)) return { valid: false, reason: 'Coordinates are missing.' };
    if (coords.length < 2) return { valid: false, reason: 'LineString has only ' + coords.length + ' coordinate(s); at least 2 are required.' };
    if (!coords.every(isValidCoordinate)) return { valid: false, reason: 'LineString contains an invalid coordinate.' };
    return { valid: true, reason: '' };
  }

  // Ray-casting point-in-ring test.
  function pointInRing(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // polygon = array of rings; ring 0 is the outer boundary, later rings are holes.
  function pointInPolygon(pt, polygon) {
    if (!pointInRing(pt, polygon[0])) return false;
    return !polygon.slice(1).some(hole => pointInRing(pt, hole));
  }

  function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
  function withinBox(p, a, b) {
    return Math.min(a[0], b[0]) <= p[0] && p[0] <= Math.max(a[0], b[0]) &&
           Math.min(a[1], b[1]) <= p[1] && p[1] <= Math.max(a[1], b[1]);
  }

  // Do segments p1-p2 and p3-p4 intersect (touching and collinear overlap count)?
  function segmentsIntersect(p1, p2, p3, p4) {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if (d1 === 0 && withinBox(p1, p3, p4)) return true;
    if (d2 === 0 && withinBox(p2, p3, p4)) return true;
    if (d3 === 0 && withinBox(p3, p1, p2)) return true;
    if (d4 === 0 && withinBox(p4, p1, p2)) return true;
    return false;
  }

  function lineCrossesPolygonEdge(line, polygon) {
    for (const ring of polygon)
      for (let i = 0; i < line.length - 1; i++)
        for (let j = 0; j < ring.length - 1; j++)
          if (segmentsIntersect(line[i], line[i + 1], ring[j], ring[j + 1])) return true;
    return false;
  }

  /* Classify a valid line against the business district polygon(s).
     CONSERVATIVE RULE: any non-zero intersection (fully inside, crossing, or touching) => business district.
     relation: 'inside' | 'crossing' (partly inside or touching the boundary) | 'outside' */
  function classifyLine(line, polygons) {
    let relation = 'outside';
    for (const polygon of polygons) {
      const edgeHit = lineCrossesPolygonEdge(line, polygon);
      const allInside = line.every(pt => pointInPolygon(pt, polygon));
      const anyInside = line.some(pt => pointInPolygon(pt, polygon));
      if (allInside && !edgeHit) return { area: 'business', relation: 'inside' };
      if (edgeHit || anyInside) relation = 'crossing';
    }
    return { area: relation === 'outside' ? 'outside' : 'business', relation };
  }

  return { isValidCoordinate, validateLineString, pointInPolygon, segmentsIntersect, classifyLine };
});
