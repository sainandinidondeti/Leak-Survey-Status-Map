/* Map rendering only (Leaflet). Knows how to draw things, not how to calculate them. */
const MapView = (function () {
  let map, districtLayer, segmentLayer;
  const lines = {};   // segment id -> Leaflet polyline

  // OpenStreetMap's tile servers reject requests that carry no Referer. A page opened by double-click
  // (file://) sends none, so in that case we use CARTO tiles (also built from OpenStreetMap data).
  function init(elementId, onTileProblem) {
    map = L.map(elementId).setView([40.005, -83.0], 14);
    const openedAsFile = location.protocol === 'file:';
    const tiles = L.tileLayer(
      openedAsFile ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19, subdomains: 'abcd',
        attribution: openedAsFile
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
    let warned = false;
    tiles.on('tileerror', () => { if (!warned) { warned = true; if (onTileProblem) onTileProblem(); } });
    segmentLayer = L.layerGroup().addTo(map);
  }

  function drawDistrict(polygons) {
    if (districtLayer) districtLayer.remove();
    // GeoJSON is [lon, lat]; Leaflet wants [lat, lon].
    const latLngPolys = polygons.map(poly => poly.map(ring => ring.map(c => [c[1], c[0]])));
    districtLayer = L.polygon(latLngPolys, { color: '#3b5b92', weight: 2, dashArray: '6 4', fillColor: '#3b5b92', fillOpacity: 0.08, interactive: false }).addTo(map);
    districtLayer.bindTooltip('Business district', { sticky: true });
  }

  // items: [{record, result}] to draw. Records with invalid geometry are never passed a path.
  function drawSegments(items, colors, onSelect, popupHtml) {
    segmentLayer.clearLayers();
    Object.keys(lines).forEach(k => delete lines[k]);
    const labelSides = ['top', 'bottom', 'left', 'right'];   // spread labels so nearby pipes overlap less
    let drawnCount = 0;
    items.forEach(({ record, result }) => {
      if (!record.geometryValid) return;
      const line = L.polyline(record.coordinates.map(c => [c[1], c[0]]), { color: colors[result.status], weight: 7, opacity: 0.95 });
      line.bindPopup(popupHtml(record, result));
      line.bindTooltip(record.id, { permanent: true, direction: labelSides[drawnCount++ % 4], className: 'seg-label' });
      line.on('click', () => onSelect(record.id));
      line.addTo(segmentLayer);
      lines[record.id] = line;
    });
  }

  // Zoom to the district polygon plus every drawn line (built by hand: a LayerGroup has no getBounds()).
  function fitAll() {
    map.invalidateSize();   // re-measure the map box before fitting, so the zoom is right
    const bounds = L.latLngBounds([]);
    if (districtLayer) bounds.extend(districtLayer.getBounds());
    Object.keys(lines).forEach(id => bounds.extend(lines[id].getBounds()));
    if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
  }

  function fitDistrict() { map.invalidateSize(); if (districtLayer) map.fitBounds(districtLayer.getBounds().pad(0.1)); }

  function focus(id) {
    const line = lines[id];
    if (!line) return false;
    map.fitBounds(line.getBounds().pad(1.5), { maxZoom: 17 });
    line.openPopup();
    return true;
  }

  return { init, drawDistrict, drawSegments, fitAll, fitDistrict, focus };
})();
