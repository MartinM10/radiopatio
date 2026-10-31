import { LEAFLET_CSS, LEAFLET_JS } from '../vendor/leaflet';

/**
 * Página del mapa (Leaflet + OpenStreetMap) que vive dentro de un WebView.
 *
 * El HTML es ESTÁTICO: no lleva avisos dentro. La app le envía órdenes con
 * `window.__rp(msg)` (web: postMessage) y la página responde con
 * `ReactNativeWebView.postMessage` (web: parent.postMessage). Así los avisos
 * nuevos, la ubicación o la selección se actualizan sin recargar el mapa ni
 * perder el zoom, y el mapa funciona igual en Android, iOS y web.
 *
 * App → mapa:  data {clusters, hexes} · highlight {ids} · user {lat,lng}
 *              view {lat,lng,zoom,animate} · pin {lat,lng,fly}
 * Mapa → app:  ready · select {key, ids} (key null = nada) · pick {lat,lng}
 *
 * Todo texto que escriben los vecinos entra en el HTML a través de esc().
 */
export interface MapPageConfig {
  /** true: selector de ubicación (pin arrastrable); false: ver avisos. */
  pick: boolean;
  lat: number;
  lng: number;
  zoom: number;
}

const PAGE_CSS = `
html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #EAF1F6; overflow: hidden;
  touch-action: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
.leaflet-container { background: #EAF1F6 !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.leaflet-control-attribution { background: rgba(255,255,255,.88) !important; color: #64748B !important; font-size: 9px !important; border-radius: 6px 0 0 0; padding: 2px 6px; }
.leaflet-control-attribution a { color: #4F46E5 !important; }
.leaflet-bar a { width: 38px !important; height: 38px !important; line-height: 38px !important; font-size: 20px !important;
  background: #fff !important; color: #0F172A !important; border-bottom: 1px solid #E2E8F0 !important; }
.leaflet-bar { box-shadow: 0 2px 8px rgba(15,23,42,.18) !important; border: none !important; border-radius: 10px !important; overflow: hidden; }
.custom-pin { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%;
  background: #fff; border: 2.5px solid #FF5A4F; box-shadow: 0 3px 12px rgba(0,0,0,.2); cursor: pointer;
  transition: transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s; box-sizing: border-box; }
.custom-pin svg { width: 20px; height: 20px; }
.custom-pin.selected { transform: scale(1.22); box-shadow: 0 0 0 5px rgba(79,70,229,.32), 0 4px 14px rgba(0,0,0,.25); }
.count-pin { display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%;
  border: 3px solid #fff; box-shadow: 0 3px 12px rgba(0,0,0,.3); color: #fff; font-weight: 800; font-size: 18px; cursor: pointer;
  transition: transform .18s cubic-bezier(.34,1.56,.64,1), box-shadow .18s; box-sizing: border-box; }
.count-pin.selected { transform: scale(1.18); box-shadow: 0 0 0 5px rgba(79,70,229,.32), 0 4px 14px rgba(0,0,0,.3); }
.pick-pin { filter: drop-shadow(0 4px 6px rgba(0,0,0,.35)); cursor: grab; }
.me-dot { width: 18px; height: 18px; border-radius: 50%; background: #2563EB; border: 3px solid #fff; box-sizing: border-box;
  box-shadow: 0 0 0 0 rgba(37,99,235,.5); animation: me 2.2s infinite; }
@keyframes me { 0% { box-shadow: 0 0 0 0 rgba(37,99,235,.5); } 70% { box-shadow: 0 0 0 16px rgba(37,99,235,0); } 100% { box-shadow: 0 0 0 0 rgba(37,99,235,0); } }
`;

// Iconos de categoría. @P = atributos de trazo, @C = color.
const PAGE_SCRIPT = String.raw`
(function () {
  var CFG = window.__RP_CFG;
  var ICONS = {
    hogar: '<path d="M3 10.5L12 3l9 7.5" @P/><path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" @P/>',
    vehiculo: '<path d="M5 17h14a2 2 0 0 0 2-2v-4l-3-5H6L3 11v4a2 2 0 0 0 2 2z" @P/><circle cx="7.5" cy="17.5" r="2.5" @P/><circle cx="16.5" cy="17.5" r="2.5" @P/>',
    hurto: '<rect x="4" y="8" width="16" height="13" rx="2" @P/><path d="M8 8V6a4 4 0 0 1 8 0v2" @P/>',
    agresion: '<path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" @P/><line x1="12" y1="8" x2="12" y2="13" @P/>',
    vandalismo: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" @P/>',
    sospechoso: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" @P/><circle cx="12" cy="12" r="3" @P/>',
    altercado: '<path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V5L7 9H4a1 1 0 0 0-1 1z" @P/><path d="M16 8a5 5 0 0 1 0 8" @P/>',
    corte_agua: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" @P/><path d="M12 9v5" @P/>',
    corte_luz: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" @P/>',
    alumbrado: '<path d="M9 18h6" @P/><path d="M10 22h4" @P/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" @P/>',
    calzada: '<path d="M4 21L9.5 4h5L20 21" @P/><line x1="2" y1="21" x2="22" y2="21" @P/><line x1="7" y1="14" x2="17" y2="14" @P/>',
    limpieza: '<path d="M3 6h18" @P/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" @P/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" @P/>',
    perdido: '<circle cx="12" cy="14" r="4.5" @P/><circle cx="7" cy="9.5" r="2" fill="@C"/><circle cx="17" cy="9.5" r="2" fill="@C"/><circle cx="10" cy="5.5" r="1.8" fill="@C"/><circle cx="14" cy="5.5" r="1.8" fill="@C"/>',
    otro: '<circle cx="12" cy="12" r="8" @P/><line x1="12" y1="8" x2="12" y2="12" @P/>'
  };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function svg(cat, color) {
    var attrs = 'stroke="' + esc(color) + '" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"';
    var body = (ICONS[cat] || ICONS.otro).split('@P').join(attrs).split('@C').join(esc(color));
    return '<svg viewBox="0 0 24 24">' + body + '</svg>';
  }
  function send(o) {
    var s = JSON.stringify(o);
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) window.ReactNativeWebView.postMessage(s);
    else if (window.parent && window.parent !== window) window.parent.postMessage(s, '*');
  }
  function r5(n) { return Math.round(n * 100000) / 100000; }

  var map = L.map('map', { zoomControl: true, attributionControl: true, tap: false, bounceAtZoomLimits: false })
    .setView([CFG.lat, CFG.lng], CFG.zoom);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, subdomains: 'abc',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  var hexLayer = L.layerGroup().addTo(map);
  var markerLayer = L.layerGroup().addTo(map);
  var clusters = [], hexes = [], markerByKey = {}, hexByKey = {}, highlight = {};
  var userMarker = null, pinMarker = null;

  function isHi(ids) {
    for (var i = 0; i < ids.length; i++) if (highlight[ids[i]]) return true;
    return false;
  }
  function clusterIcon(c) {
    var hi = isHi(c.ids) ? ' selected' : '';
    if (c.count > 1) {
      return L.divIcon({ className: 'custom-pin-wrap', iconSize: [44, 44], iconAnchor: [22, 22],
        html: '<div class="count-pin' + hi + '" style="background:' + esc(c.color) + '">' + c.count + '</div>' });
    }
    return L.divIcon({ className: 'custom-pin-wrap', iconSize: [40, 40], iconAnchor: [20, 20],
      html: '<div class="custom-pin' + hi + '" style="border-color:' + esc(c.color) + '">' + svg(c.category, c.color) + '</div>' });
  }
  function hexStyle(h) {
    var hi = isHi(h.ids);
    return { color: h.color, fillColor: h.color, fillOpacity: h.count > 0 ? (hi ? 0.3 : 0.2) : 0.06,
      weight: hi ? 4 : (h.count > 0 ? 2 : 1), dashArray: h.count === 0 ? '3, 4' : null, bubblingMouseEvents: false };
  }

  function setData(d) {
    hexLayer.clearLayers(); markerLayer.clearLayers(); markerByKey = {}; hexByKey = {};
    hexes = d.hexes || []; clusters = d.clusters || [];
    hexes.forEach(function (h) {
      var poly = L.polygon(h.polygon, hexStyle(h)).addTo(hexLayer);
      hexByKey[h.key] = poly;
      if (h.count > 0) poly.on('click', function () { send({ type: 'select', key: h.key, ids: h.ids }); });
    });
    clusters.forEach(function (c) {
      var m = L.marker([c.lat, c.lng], { icon: clusterIcon(c), keyboard: false, zIndexOffset: c.severity * 100 + c.count }).addTo(markerLayer);
      markerByKey[c.key] = m;
      m.on('click', function () { send({ type: 'select', key: c.key, ids: c.ids }); });
    });
  }
  function setHighlight(ids) {
    highlight = {};
    (ids || []).forEach(function (i) { highlight[i] = true; });
    clusters.forEach(function (c) { if (markerByKey[c.key]) markerByKey[c.key].setIcon(clusterIcon(c)); });
    hexes.forEach(function (h) { if (hexByKey[h.key]) hexByKey[h.key].setStyle(hexStyle(h)); });
  }
  function setUser(lat, lng) {
    var icon = L.divIcon({ className: 'me-wrap', html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
    if (userMarker) userMarker.setLatLng([lat, lng]);
    else userMarker = L.marker([lat, lng], { icon: icon, interactive: false, keyboard: false, zIndexOffset: -1000 }).addTo(map);
  }
  function setView(m) {
    if (m.animate === false) map.setView([m.lat, m.lng], m.zoom);
    else map.flyTo([m.lat, m.lng], m.zoom, { duration: 0.6 });
  }

  // Selector de ubicación: pin con la punta en el punto marcado, arrastrable.
  function setPin(lat, lng, fly) {
    if (!pinMarker) {
      var icon = L.divIcon({ className: 'pick-pin-wrap', iconSize: [36, 46], iconAnchor: [18, 45],
        html: '<div class="pick-pin"><svg width="36" height="46" viewBox="0 0 36 46"><path d="M18 45C18 45 3 29.5 3 17a15 15 0 0 1 30 0c0 12.5-15 28-15 28z" fill="#FF5A4F" stroke="#fff" stroke-width="3"/><circle cx="18" cy="17" r="5.5" fill="#fff"/></svg></div>' });
      pinMarker = L.marker([lat, lng], { icon: icon, draggable: true, autoPan: true, keyboard: false, zIndexOffset: 1000 }).addTo(map);
      pinMarker.on('dragend', function () {
        var p = pinMarker.getLatLng();
        send({ type: 'pick', lat: r5(p.lat), lng: r5(p.lng) });
      });
    } else {
      pinMarker.setLatLng([lat, lng]);
    }
    if (fly) map.flyTo([lat, lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
  }

  if (CFG.pick) {
    map.on('click', function (e) {
      setPin(e.latlng.lat, e.latlng.lng, false);
      send({ type: 'pick', lat: r5(e.latlng.lat), lng: r5(e.latlng.lng) });
    });
  } else {
    map.on('click', function () { send({ type: 'select', key: null, ids: [] }); });
  }

  function handle(m) {
    if (!m || !m.type) return;
    if (m.type === 'data') setData(m);
    else if (m.type === 'highlight') setHighlight(m.ids);
    else if (m.type === 'user') setUser(m.lat, m.lng);
    else if (m.type === 'view') setView(m);
    else if (m.type === 'pin') setPin(m.lat, m.lng, m.fly);
  }
  window.__rp = handle;                                   // WebView nativo
  window.addEventListener('message', function (e) {      // web (iframe)
    if (e.source !== window.parent) return;
    try { handle(JSON.parse(e.data)); } catch (err) {}
  });

  if (window.ResizeObserver) {
    new ResizeObserver(function () { map.invalidateSize({ pan: false }); }).observe(document.getElementById('map'));
  }
  send({ type: 'ready' });
})();
`;

export function buildMapHtml(cfg: MapPageConfig): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8" />' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />' +
    `<style>${LEAFLET_CSS}${PAGE_CSS}</style></head><body><div id="map"></div>` +
    `<script>window.__RP_CFG=${JSON.stringify(cfg)};</script>` +
    `<script>${LEAFLET_JS}</script>` +
    `<script>${PAGE_SCRIPT}</script></body></html>`
  );
}
