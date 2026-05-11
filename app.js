/* ============================================================
   Triton Weather Radar — app logic
   - MapTiler dark base
   - RainViewer animated NEXRAD (past + nowcast)
   - NWS active alerts with severity filter
   ============================================================ */
(function () {
  'use strict';

  const CFG = window.TRITON_CONFIG || {};

  // NWS area codes — 50 states + DC + territories that NWS covers
  const STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],
    ['CA','California'],['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],
    ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],
    ['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],
    ['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
    ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
    ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
    ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
    ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
    ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],
    ['VT','Vermont'],['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],
    ['WI','Wisconsin'],['WY','Wyoming'],['DC','District of Columbia'],
    ['PR','Puerto Rico']
  ];

  // Approximate state bounding boxes: [south, west, north, east].
  // Used to fly the map to the selected state's geographic extent so the
  // dropdown gives a true state-focused view rather than relying on whether
  // any alert polygons happen to exist in that state.
  const STATE_BBOX = {
    AL: [30.14, -88.47, 35.01, -84.89], AK: [51.20, -179.10, 71.40, -129.90],
    AZ: [31.33, -114.82, 37.00, -109.04], AR: [33.00, -94.62, 36.50, -89.64],
    CA: [32.53, -124.41, 42.01, -114.13], CO: [36.99, -109.06, 41.00, -102.04],
    CT: [40.95, -73.73, 42.05, -71.79],  DE: [38.45, -75.79, 39.84, -75.05],
    FL: [24.39, -87.63, 31.00, -80.03],  GA: [30.36, -85.61, 35.00, -80.84],
    HI: [18.91, -160.25, 22.24, -154.81], ID: [41.99, -117.24, 49.00, -111.04],
    IL: [36.97, -91.51, 42.51, -87.50],  IN: [37.77, -88.10, 41.76, -84.78],
    IA: [40.38, -96.64, 43.50, -90.14],  KS: [36.99, -102.05, 40.00, -94.59],
    KY: [36.50, -89.57, 39.15, -81.96],  LA: [28.93, -94.04, 33.02, -88.82],
    ME: [43.06, -71.08, 47.46, -66.95],  MD: [37.91, -79.49, 39.72, -75.05],
    MA: [41.18, -73.51, 42.89, -69.85],  MI: [41.70, -90.42, 48.31, -82.41],
    MN: [43.50, -97.24, 49.39, -89.49],  MS: [30.17, -91.65, 35.00, -88.10],
    MO: [35.99, -95.77, 40.61, -89.10],  MT: [44.36, -116.05, 49.00, -104.04],
    NE: [39.99, -104.05, 43.00, -95.31], NV: [35.00, -120.01, 42.00, -114.04],
    NH: [42.70, -72.56, 45.31, -70.61],  NJ: [38.93, -75.56, 41.36, -73.89],
    NM: [31.33, -109.05, 37.00, -103.00], NY: [40.50, -79.76, 45.02, -71.86],
    NC: [33.84, -84.32, 36.59, -75.46],  ND: [45.94, -104.05, 49.00, -96.55],
    OH: [38.40, -84.82, 41.98, -80.52],  OK: [33.62, -103.00, 37.00, -94.43],
    OR: [41.99, -124.57, 46.29, -116.46], PA: [39.72, -80.52, 42.27, -74.69],
    RI: [41.15, -71.86, 42.02, -71.12],  SC: [32.03, -83.35, 35.22, -78.54],
    SD: [42.48, -104.06, 45.94, -96.44], TN: [34.98, -90.31, 36.68, -81.65],
    TX: [25.84, -106.65, 36.50, -93.51], UT: [36.99, -114.05, 42.00, -109.04],
    VT: [42.73, -73.43, 45.02, -71.46],  VA: [36.54, -83.68, 39.47, -75.16],
    WA: [45.54, -124.85, 49.00, -116.92], WV: [37.20, -82.64, 40.64, -77.72],
    WI: [42.49, -92.89, 47.08, -86.25],  WY: [40.99, -111.06, 45.01, -104.05],
    DC: [38.79, -77.12, 38.99, -76.91],  PR: [17.92, -67.27, 18.52, -65.59],
  };

  const SEVERITY_ORDER = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  const SEVERITY_COLORS = {
    Extreme: '#ff1744',
    Severe:  '#ff6d00',
    Moderate:'#ffd600',
    Minor:   '#00b0ff',
    Unknown: '#8e94a8'
  };

  // Single transparent pixel — served via errorTileUrl when a tile 404s
  // (e.g. RainViewer past the radar coverage edge).
  const BLANK_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

  // -------------------- shared state --------------------
  const S = {
    map: null,
    baseLayer: null,
    baseSwapTimer: null,
    labelsLayer: null,
    userLocMarker: null,
    userLocCircle: null,
    baseStyle: CFG.MAPTILER_STYLE || 'dataviz-dark',
    radarData: null,          // cached RainViewer JSON
    radarLayers: [],          // [{layer, time, isFuture}]
    radarSig: null,           // fingerprint to skip no-op rebuilds
    radarIdx: 0,
    radarHost: '',
    radarTimer: null,
    radarRefreshTimer: null,

    playing: true,
    speedMs: 700,
    opacity: 0.75,
    colorScheme: 6,
    smooth: true,
    showForecast: true,

    showAlerts: true,
    alertLayer: null,
    allAlerts: [],            // [{feature, severity, hasGeom, layer}]
    alertSig: null,
    alertsAbort: null,
    filter: 'all',
    state: CFG.DEFAULT_STATE || 'OK',

    showRadarSites: true,
    radarSitesData: null,
    radarSitesLayer: null,
    radarSiteMarkers: {},     // id -> Leaflet marker (for selection updates)
    selectedSiteId: null,

    showCoverageRings: false,
    coverageRingsLayer: null,

    showSpcOutlook: true,
    spcOutlookData: null,
    spcOutlookLayer: null,
    spcOutlookTimer: null,

    showSpcWatches: true,
    spcWatchesData: null,
    spcWatchesLayer: null,
    spcWatchesAbort: null,
    spcWatchesTimer: null,

    showStormReports: false,
    stormReportsLayer: null,
    stormReportsTimer: null,

    showCounties: false,
    countiesLayer: null,
    countiesCache: {},        // state -> GeoJSON FeatureCollection

    sheetExpanded: false,
    layersOpen: false,
    searchOpen: false,
    alertTimer: null,

    pinMarker: null,
    searchAbort: null,
    searchDebounce: null,
  };

  // -------------------- helpers --------------------
  const $ = (id) => document.getElementById(id);

  function fmtTime(ts) {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function fmtDateTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function showToast(msg, type) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type === 'error' ? ' error' : '');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function showLoader(text) {
    $('loader-text').textContent = text || 'Loading…';
    $('loader').classList.add('show');
  }
  function hideLoader() { $('loader').classList.remove('show'); }

  function setRangeFill(input) {
    const min = +input.min || 0;
    const max = +input.max || 100;
    const pct = max === min ? 0 : ((+input.value - min) / (max - min)) * 100;
    input.style.setProperty('--fill', pct + '%');
  }

  // -------------------- map --------------------
  function initMap() {
    S.map = L.map('map', {
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true,
      zoomSnap: 1,
      maxZoom: 18,
      minZoom: 3,
    }).setView(CFG.DEFAULT_CENTER, CFG.DEFAULT_ZOOM);

    L.control.zoom({ position: 'bottomright' }).addTo(S.map);

    // Custom pane for labels — sits above radar (tilePane=200) but below
    // alert polygons (overlayPane=400) so city names stay readable through
    // the radar overlay.
    S.map.createPane('labelsPane');
    S.map.getPane('labelsPane').style.zIndex = 350;
    S.map.getPane('labelsPane').style.pointerEvents = 'none';

    // Custom pane stacking order (top of stack at bottom of list):
    //   200 tilePane (base + radar)
    //   320 countiesPane         — faint county outlines
    //   350 labelsPane           — city names
    //   380 spcOutlookPane       — Day-1 categorical risk polygons
    //   400 overlayPane          — NWS warnings + SPC watches
    //   430 radarRingsPane       — WSR-88D / TDWR coverage circles
    //   450 radarSitesPane       — NEXRAD dots + sweep wedges
    //   480 stormReportsPane     — tornado / hail / wind dots
    //   600 markerPane           — user location, search pin
    S.map.createPane('countiesPane');
    S.map.getPane('countiesPane').style.zIndex = 320;
    S.map.getPane('countiesPane').style.pointerEvents = 'none';

    S.map.createPane('spcOutlookPane');
    S.map.getPane('spcOutlookPane').style.zIndex = 380;

    S.map.createPane('radarRingsPane');
    S.map.getPane('radarRingsPane').style.zIndex = 430;
    S.map.getPane('radarRingsPane').style.pointerEvents = 'none';

    S.map.createPane('radarSitesPane');
    S.map.getPane('radarSitesPane').style.zIndex = 450;

    S.map.createPane('stormReportsPane');
    S.map.getPane('stormReportsPane').style.zIndex = 480;

    setBaseStyle(S.baseStyle);
    addLabelsOverlay();

    // Hide radar site labels at country-wide zoom to keep the map readable.
    const updateLabelZoomClass = () => {
      document.body.classList.toggle('zoomed-out', S.map.getZoom() < 6);
    };
    S.map.on('zoomend', updateLabelZoomClass);
    updateLabelZoomClass();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAnim();
      } else {
        if (S.playing) startAnim();
        fetchAlerts(false);
        if (S.showSpcWatches) fetchSpcWatches();
        if (S.showStormReports) fetchStormReports();
      }
    });
  }

  function addLabelsOverlay() {
    const retina = (window.devicePixelRatio || 1) > 1.4 ? '@2x' : '';
    S.labelsLayer = L.tileLayer(
      `https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}${retina}.png`,
      {
        pane: 'labelsPane',
        subdomains: 'abcd',
        maxZoom: 18,
        // Carto retina labels top out around z=18; keep one level of headroom
        // so the upscaled view doesn't generate 404s at our map maxZoom.
        maxNativeZoom: 17,
        attribution: '<a href="https://carto.com/attributions" target="_blank">© Carto</a>',
        crossOrigin: true,
        errorTileUrl: BLANK_PNG,
      }
    ).addTo(S.map);
  }

  // Per-style max native zoom for MapTiler raster + retina. Going past a
  // style's supported zoom returns "Zoom Level Not Supported" (a 400 JSON
  // response that fails the <img> decode). Cap conservatively here and let
  // Leaflet upscale to the map's maxZoom.
  const MAPTILER_MAX_NATIVE_ZOOM = {
    'dataviz-dark': 16,
    'streets-v2-dark': 17,
    'basic-v2-dark': 17,
    'hybrid': 17,
    'satellite': 17,
  };

  function setBaseStyle(styleId) {
    S.baseStyle = styleId;
    const retina = (window.devicePixelRatio || 1) > 1.4 ? '@2x' : '';
    // Satellite/hybrid use jpg; vector-derived dark styles use png
    const ext = (styleId === 'satellite' || styleId === 'hybrid') ? 'jpg' : 'png';
    const url = `https://api.maptiler.com/maps/${styleId}/{z}/{x}/{y}${retina}.${ext}?key=${CFG.MAPTILER_KEY}`;
    const maxNative = MAPTILER_MAX_NATIVE_ZOOM[styleId] ?? 16;
    const newLayer = L.tileLayer(url, {
      attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OSM</a> · NWS · RainViewer',
      maxZoom: 18,
      maxNativeZoom: maxNative,
      crossOrigin: true,
      zIndex: 1,
      errorTileUrl: BLANK_PNG,
    });
    newLayer.addTo(S.map);
    const old = S.baseLayer;
    S.baseLayer = newLayer;
    // Cancel any pending removal so rapid style switches don't leak layers.
    if (S.baseSwapTimer) clearTimeout(S.baseSwapTimer);
    if (old) {
      S.baseSwapTimer = setTimeout(() => {
        S.map.removeLayer(old);
        S.baseSwapTimer = null;
      }, 250);
    }
  }

  // -------------------- state selector --------------------
  function initStateSelect() {
    const sel = $('state-select');
    sel.innerHTML = STATES.map(([code, name]) =>
      `<option value="${code}"${code === S.state ? ' selected' : ''}>${code} — ${name}</option>`
    ).join('');
    sel.addEventListener('change', (e) => {
      S.state = e.target.value;
      flyToState(S.state, { animate: true });
      // No need to re-fit on the alert response — the state fly already
      // framed the view. flyTo: false avoids the alert layer overriding us.
      fetchAlerts(false);
      if (S.showCounties) fetchCounties(S.state);
    });
  }

  // Frame the map on a state's geographic bounds. maxZoom caps the
  // fitBounds for tiny states (RI, DE, DC) so we don't zoom all the way
  // to street level on the smallest jurisdictions.
  function flyToState(code, opts) {
    const bbox = STATE_BBOX[code];
    if (!bbox) return;
    const [s, w, n, e] = bbox;
    const bounds = L.latLngBounds([s, w], [n, e]);
    S.map.fitBounds(bounds, {
      maxZoom: 9,
      padding: [40, 40],
      animate: !!(opts && opts.animate),
    });
  }

  // -------------------- radar --------------------
  async function initRadar() {
    showLoader('Loading radar…');
    try {
      await fetchRadar();
    } catch (e) {
      showToast('Radar failed to load — will retry', 'error');
      console.error(e);
    } finally {
      hideLoader();
    }
    if (S.radarRefreshTimer) clearInterval(S.radarRefreshTimer);
    S.radarRefreshTimer = setInterval(() => {
      if (!document.hidden) fetchRadar().catch(console.error);
    }, CFG.RADAR_REFRESH_MS);
  }

  async function fetchRadar() {
    const r = await fetch('https://api.rainviewer.com/public/weather-maps.json', { cache: 'no-store' });
    if (!r.ok) throw new Error('RainViewer ' + r.status);
    S.radarData = await r.json();
    S.radarHost = S.radarData.host;
    rebuildRadarLayers();
  }

  // Builds (or rebuilds) tile layers from the cached RainViewer JSON using
  // the current colorScheme / smooth / showForecast settings. Called both
  // after a network fetch and after a settings toggle, so toggles don't
  // re-hit the API.
  function rebuildRadarLayers() {
    if (!S.radarData) return;

    const past = S.radarData.radar?.past || [];
    const nowcast = S.showForecast ? (S.radarData.radar?.nowcast || []) : [];
    const frames = [
      ...past.map(f => ({ ...f, isFuture: false })),
      ...nowcast.map(f => ({ ...f, isFuture: true })),
    ];

    // Fingerprint includes render settings + frame times, so an auto-refresh
    // with no new frames is a no-op and a settings change with the same
    // frames forces a rebuild.
    const sig = [
      S.colorScheme, S.smooth ? 1 : 0,
      ...frames.map(f => f.time + (f.isFuture ? 'n' : 'p'))
    ].join('|');
    if (sig === S.radarSig && S.radarLayers.length) return;
    S.radarSig = sig;

    // Remember which frame the user was viewing so we can land on it again
    // after rebuild (otherwise auto-refresh jumps back to "now" mid-scrub).
    const prevTime = S.radarLayers[S.radarIdx]?.time;

    for (const r of S.radarLayers) S.map.removeLayer(r.layer);
    S.radarLayers = [];

    if (!frames.length) return;

    for (const f of frames) {
      // 512px tiles give double pixel density (sharper at every zoom level)
      // for the same network cost as 256px @2x. tileSize:512 tells Leaflet
      // each tile is 512 CSS px.
      const url = `${S.radarHost}${f.path}/512/{z}/{x}/{y}/${S.colorScheme}/${S.smooth ? 1 : 0}_1.png`;
      const layer = L.tileLayer(url, {
        tileSize: 512,
        opacity: 0,
        zIndex: 200,
        crossOrigin: true,
        // RainViewer publishes radar tiles only up to native zoom 12 — let
        // Leaflet upscale the highest available tile at deeper zooms instead
        // of returning 404s.
        maxZoom: 18,
        maxNativeZoom: 12,
        minNativeZoom: 1,
        errorTileUrl: BLANK_PNG,
      });
      layer.addTo(S.map);
      S.radarLayers.push({ layer, time: f.time, isFuture: f.isFuture });
    }

    const scrub = $('frame-scrub');
    scrub.max = Math.max(0, S.radarLayers.length - 1);
    setRangeFill(scrub);

    let targetIdx = Math.max(0, past.length - 1);
    if (prevTime != null) {
      const found = S.radarLayers.findIndex(r => r.time === prevTime);
      if (found >= 0) targetIdx = found;
    }
    setFrame(targetIdx);

    if (S.playing) startAnim();
  }

  function setFrame(idx) {
    if (!S.radarLayers.length) return;
    idx = Math.max(0, Math.min(S.radarLayers.length - 1, idx));
    for (let i = 0; i < S.radarLayers.length; i++) {
      S.radarLayers[i].layer.setOpacity(i === idx ? S.opacity : 0);
    }
    S.radarIdx = idx;

    const cur = S.radarLayers[idx];
    const t = $('frame-time');
    t.textContent = fmtTime(cur.time);
    t.classList.toggle('future', cur.isFuture);
    $('frame-label').textContent = cur.isFuture ? 'FORECAST' : 'RADAR';

    const scrub = $('frame-scrub');
    if (+scrub.value !== idx) scrub.value = idx;
    setRangeFill(scrub);
  }

  function startAnim() {
    stopAnim();
    if (!S.radarLayers.length) return;
    S.radarTimer = setInterval(() => {
      let next = S.radarIdx + 1;
      if (next >= S.radarLayers.length) next = 0;
      setFrame(next);
    }, S.speedMs);
  }
  function stopAnim() {
    if (S.radarTimer) { clearInterval(S.radarTimer); S.radarTimer = null; }
  }

  // -------------------- alerts --------------------
  async function fetchAlerts(flyTo) {
    if (S.alertsAbort) S.alertsAbort.abort();
    S.alertsAbort = new AbortController();
    try {
      const url = `https://api.weather.gov/alerts/active?area=${encodeURIComponent(S.state)}`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/geo+json' },
        cache: 'no-store',
        signal: S.alertsAbort.signal,
      });
      if (!r.ok) throw new Error('NWS ' + r.status);
      const geo = await r.json();
      renderAlerts(geo, flyTo);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.error('alerts fetch failed', e);
      showToast('Alert refresh failed', 'error');
    }
  }

  const severityOf = (f) => f?.properties?.severity || 'Unknown';

  function renderAlerts(geo, flyTo) {
    const features = geo.features || [];

    // Fingerprint by id + sent time + state. State is included so a state
    // switch always invalidates the cache even if alert IDs happen to clash.
    const sig = 'state=' + S.state + '|' + features
      .map(f => `${f.id}:${f.properties?.sent || ''}`)
      .sort()
      .join('|');
    if (sig === S.alertSig && S.alertLayer) return;
    S.alertSig = sig;

    if (S.alertLayer) S.map.removeLayer(S.alertLayer);
    S.alertLayer = null;
    S.allAlerts = [];

    const polyFeatures = features.filter(f => f.geometry);

    S.alertLayer = L.geoJSON(polyFeatures, {
      style: (f) => {
        const sev = severityOf(f);
        const color = SEVERITY_COLORS[sev] || SEVERITY_COLORS.Unknown;
        return {
          color, weight: 2, opacity: 0.9,
          fillColor: color, fillOpacity: 0.18,
          className: 'alert-polygon severity-' + sev.toLowerCase()
        };
      },
      onEachFeature: (f, layer) => {
        const color = SEVERITY_COLORS[severityOf(f)] || SEVERITY_COLORS.Unknown;
        layer.bindPopup(buildPopup(f, color), { maxWidth: 320, autoPan: true });
      }
    });
    if (S.showAlerts) S.alertLayer.addTo(S.map);

    const layersByFeature = new Map();
    S.alertLayer.eachLayer(l => {
      const id = l.feature?.id;
      if (id) layersByFeature.set(id, l);
    });

    for (const f of features) {
      S.allAlerts.push({
        feature: f,
        severity: severityOf(f),
        hasGeom: !!f.geometry,
        layer: layersByFeature.get(f.id) || null,
      });
    }

    // Sort: severity asc, then sent time desc
    S.allAlerts.sort((a, b) => {
      const sa = SEVERITY_ORDER[a.severity] ?? 9;
      const sb = SEVERITY_ORDER[b.severity] ?? 9;
      if (sa !== sb) return sa - sb;
      const ta = new Date(a.feature.properties?.sent || 0).getTime();
      const tb = new Date(b.feature.properties?.sent || 0).getTime();
      return tb - ta;
    });

    renderAlertList();
    updateAlertCount();

    if (flyTo && polyFeatures.length) {
      try {
        const b = S.alertLayer.getBounds();
        if (b.isValid()) S.map.fitBounds(b.pad(0.15), { maxZoom: 9, animate: true });
      } catch (e) {}
    }
  }

  function filteredAlerts() {
    return S.filter === 'all'
      ? S.allAlerts
      : S.allAlerts.filter(a => a.severity === S.filter);
  }

  function updateAlertCount() {
    const n = S.allAlerts.length;
    $('alert-count-num').textContent = n;
    $('alert-count').classList.toggle('zero', n === 0);
  }

  function renderAlertList() {
    const list = $('alert-list');
    const filtered = filteredAlerts();

    $('sheet-title-text').textContent =
      S.filter === 'all'
        ? `Active Alerts · ${filtered.length}`
        : `${S.filter} · ${filtered.length} of ${S.allAlerts.length}`;

    if (!filtered.length) {
      list.innerHTML = `
        <div class="sheet-empty">
          <div class="sheet-empty-icon">✦</div>
          <div>${
            S.allAlerts.length === 0
              ? 'No active alerts in ' + S.state
              : 'No ' + S.filter.toLowerCase() + ' alerts'
          }</div>
        </div>`;
      return;
    }

    list.innerHTML = filtered.map((a, i) => {
      const p = a.feature.properties || {};
      const color = SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.Unknown;
      const event = escapeHtml(p.event || 'Alert');
      const headline = escapeHtml(p.headline || p.description || '');
      const area = escapeHtml(p.areaDesc || '');
      const noGeom = !a.hasGeom ? `<span class="alert-card-no-geom">zone-only</span>` : '';
      return `
        <div class="alert-card" data-idx="${i}" style="--card-color:${color}">
          <div class="alert-card-header">
            <div class="alert-card-event">${event}</div>
            <div class="alert-card-severity">${escapeHtml(a.severity)}</div>
          </div>
          <div class="alert-card-headline">${headline}</div>
          <div class="alert-card-meta">
            <span class="alert-card-area">${area}</span>
            ${noGeom}
          </div>
        </div>`;
    }).join('');
  }

  function buildPopup(f, color) {
    const p = f.properties || {};
    const event = escapeHtml(p.event || 'Alert');
    const sev = escapeHtml(p.severity || 'Unknown');
    const headline = escapeHtml(p.headline || '');
    const desc = p.description
      ? escapeHtml(p.description.slice(0, 280) + (p.description.length > 280 ? '…' : ''))
      : '';
    const area = escapeHtml(p.areaDesc || '');
    const onset = fmtDateTime(p.onset || p.effective);
    const ends = fmtDateTime(p.ends || p.expires);
    return `
      <div style="--popup-color:${color}">
        <div class="popup-event">${event}</div>
        <div class="popup-severity">${sev}</div>
        ${headline ? `<div class="popup-headline">${headline}</div>` : ''}
        ${desc ? `<div class="popup-headline" style="opacity:0.78">${desc}</div>` : ''}
        <div class="popup-meta">
          <div><strong>Area:</strong> ${area}</div>
          <div><strong>From:</strong> ${onset}</div>
          <div><strong>Until:</strong> ${ends}</div>
        </div>
      </div>`;
  }

  // -------------------- NEXRAD radar sites --------------------
  async function fetchRadarSites() {
    if (S.radarSitesData) { renderRadarSites(); return; }
    try {
      const r = await fetch('https://api.weather.gov/radar/stations', {
        headers: { 'Accept': 'application/geo+json' },
      });
      if (!r.ok) throw new Error('radar stations ' + r.status);
      S.radarSitesData = await r.json();
      renderRadarSites();
    } catch (e) {
      console.warn('radar sites fetch failed', e);
    }
  }

  function renderRadarSites() {
    if (S.radarSitesLayer) {
      S.map.removeLayer(S.radarSitesLayer);
      S.radarSitesLayer = null;
    }
    S.radarSiteMarkers = {};
    if (!S.showRadarSites || !S.radarSitesData) return;

    const group = L.layerGroup();
    for (const f of S.radarSitesData.features || []) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lng, lat] = f.geometry.coordinates;
      const id = f.properties?.id || '';
      const name = f.properties?.name || '';
      const type = f.properties?.stationType || '';
      const isTDWR = type === 'TDWR';
      const cls = isTDWR ? 'tdwr' : 'wsr';
      const color = isTDWR ? '#00b0ff' : '#ffb300';

      // The marker is a divIcon containing a rotating sweep wedge + a fixed
      // center dot. The wedge mirrors the rotating dish on a real Doppler
      // radar — RPM matched to type (WSR-88D ~5 RPM = 12s/rev, TDWR ~30 RPM
      // = 3s/rev). The sweep is screen-pixel sized, not geographic, so it
      // stays a comfortable size at any zoom.
      const icon = L.divIcon({
        className: `radar-site radar-site-${cls}` + (id === S.selectedSiteId ? ' selected' : ''),
        html:
          '<div class="rs-sweep"></div>' +
          '<div class="rs-dot"></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
      const marker = L.marker([lat, lng], {
        icon,
        pane: 'radarSitesPane',
        keyboard: false,
        riseOnHover: false,
      });
      marker.bindTooltip(id, {
        permanent: true,
        direction: 'right',
        offset: [10, 0],
        className: 'radar-site-label',
        pane: 'radarSitesPane',
      });
      marker.bindPopup(
        `<div class="popup-event" style="--popup-color:${color}">${escapeHtml(id)}</div>` +
        `<div class="popup-headline">${escapeHtml(name)}</div>` +
        `<div class="popup-meta">` +
          `<div><strong>Type:</strong> ${escapeHtml(type)}</div>` +
          `<div><strong>Range:</strong> ~${isTDWR ? 90 : 230} km useful</div>` +
          `<div><strong>Lat/Lon:</strong> ${lat.toFixed(3)}, ${lng.toFixed(3)}</div>` +
        `</div>`,
        { maxWidth: 260 }
      );
      // Click → select this site: fly + highlight + show its coverage ring.
      marker.on('click', () => selectRadarSite(id, lat, lng, isTDWR));
      group.addLayer(marker);
      S.radarSiteMarkers[id] = { marker, lat, lng, isTDWR, name, type, id };
    }
    S.radarSitesLayer = group;
    S.radarSitesLayer.addTo(S.map);
    // Re-render the coverage rings on top of fresh markers so toggles +
    // selection stay consistent.
    renderCoverageRings();
  }

  function selectRadarSite(id, lat, lng, isTDWR) {
    const prevId = S.selectedSiteId;
    S.selectedSiteId = id;

    // Swap "selected" class on the old + new markers.
    const restyle = (siteId) => {
      const rec = S.radarSiteMarkers[siteId];
      if (!rec) return;
      const el = rec.marker.getElement();
      if (!el) return;
      el.classList.toggle('selected', siteId === id);
    };
    if (prevId && prevId !== id) restyle(prevId);
    restyle(id);

    // Fly to the site and bring the popup forward. Use zoom 9 if we're
    // currently zoomed out — gives a useful view of the ring; otherwise
    // preserve the user's zoom.
    const targetZoom = Math.max(S.map.getZoom(), 9);
    S.map.flyTo([lat, lng], targetZoom, { duration: 1.0 });

    // If coverage rings are off, still draw THIS site's ring while selected.
    renderCoverageRings();
  }

  // Draws coverage circles around radar sites. If `showCoverageRings` is on,
  // every site gets a faint ring; the selected site (if any) gets a brighter
  // one. When the global toggle is off, only the selected site's ring shows.
  function renderCoverageRings() {
    if (S.coverageRingsLayer) {
      S.map.removeLayer(S.coverageRingsLayer);
      S.coverageRingsLayer = null;
    }
    if (!S.radarSitesData) return;

    const group = L.layerGroup();
    for (const f of S.radarSitesData.features || []) {
      if (!f.geometry || f.geometry.type !== 'Point') continue;
      const [lng, lat] = f.geometry.coordinates;
      const id = f.properties?.id;
      const isTDWR = f.properties?.stationType === 'TDWR';
      const isSelected = id === S.selectedSiteId;
      if (!S.showCoverageRings && !isSelected) continue;

      const baseColor = isTDWR ? '#00b0ff' : '#ffb300';
      const ring = L.circle([lat, lng], {
        radius: (isTDWR ? 90 : 230) * 1000, // km → meters
        color: baseColor,
        weight: isSelected ? 2 : 1,
        opacity: isSelected ? 0.85 : 0.35,
        fillColor: baseColor,
        fillOpacity: isSelected ? 0.06 : 0.02,
        dashArray: isSelected ? null : '4 4',
        pane: 'radarRingsPane',
        interactive: false,
      });
      group.addLayer(ring);
    }
    S.coverageRingsLayer = group;
    S.coverageRingsLayer.addTo(S.map);
  }

  // -------------------- SPC Day 1 categorical outlook --------------------
  // Standard SPC risk colors (RGB sRGB approximations of their pubs).
  const SPC_OUTLOOK_COLORS = {
    TSTM: '#c0e8c0', // General thunder (pale green)
    MRGL: '#7fc97f', // Marginal
    SLGT: '#f6f67f', // Slight (yellow)
    ENH:  '#e6c27e', // Enhanced (orange)
    MDT:  '#e07f7f', // Moderate (red)
    HIGH: '#ff80ff', // High (magenta)
  };
  const SPC_OUTLOOK_LABELS = {
    TSTM: 'General Thunder', MRGL: 'Marginal Risk', SLGT: 'Slight Risk',
    ENH: 'Enhanced Risk', MDT: 'Moderate Risk', HIGH: 'High Risk',
  };

  async function fetchSpcOutlook() {
    try {
      const r = await fetch('https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson', {
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('SPC outlook ' + r.status);
      S.spcOutlookData = await r.json();
      renderSpcOutlook();
    } catch (e) {
      console.warn('SPC outlook fetch failed', e);
    }
  }

  function renderSpcOutlook() {
    if (S.spcOutlookLayer) { S.map.removeLayer(S.spcOutlookLayer); S.spcOutlookLayer = null; }
    if (!S.showSpcOutlook || !S.spcOutlookData) return;

    S.spcOutlookLayer = L.geoJSON(S.spcOutlookData, {
      pane: 'spcOutlookPane',
      style: (f) => {
        const label = (f.properties?.LABEL || '').toUpperCase();
        const color = SPC_OUTLOOK_COLORS[label] || '#7fc97f';
        const isTSTM = label === 'TSTM';
        return {
          color,
          weight: 1.6,
          opacity: 0.85,
          fillColor: color,
          fillOpacity: isTSTM ? 0.10 : 0.20,
        };
      },
      onEachFeature: (f, layer) => {
        const label = (f.properties?.LABEL || '').toUpperCase();
        const human = SPC_OUTLOOK_LABELS[label] || label;
        layer.bindPopup(
          `<div class="popup-event" style="--popup-color:${SPC_OUTLOOK_COLORS[label] || '#7fc97f'}">${escapeHtml(human)}</div>` +
          `<div class="popup-headline">SPC Day 1 Convective Outlook</div>` +
          `<div class="popup-meta"><div><strong>Category:</strong> ${escapeHtml(label)}</div></div>`,
          { maxWidth: 260 }
        );
      },
    }).addTo(S.map);
  }

  // -------------------- SPC active watches --------------------
  async function fetchSpcWatches() {
    if (S.spcWatchesAbort) S.spcWatchesAbort.abort();
    S.spcWatchesAbort = new AbortController();
    try {
      const url = 'https://api.weather.gov/alerts/active?event=Tornado%20Watch,Severe%20Thunderstorm%20Watch';
      const r = await fetch(url, {
        headers: { 'Accept': 'application/geo+json' },
        cache: 'no-store',
        signal: S.spcWatchesAbort.signal,
      });
      if (!r.ok) throw new Error('SPC watches ' + r.status);
      S.spcWatchesData = await r.json();
      renderSpcWatches();
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('SPC watches fetch failed', e);
    }
  }

  function renderSpcWatches() {
    if (S.spcWatchesLayer) { S.map.removeLayer(S.spcWatchesLayer); S.spcWatchesLayer = null; }
    if (!S.showSpcWatches || !S.spcWatchesData) return;

    const polyFeatures = (S.spcWatchesData.features || []).filter(f => f.geometry);
    S.spcWatchesLayer = L.geoJSON(polyFeatures, {
      pane: 'overlayPane',
      style: (f) => {
        const isTor = (f.properties?.event || '').toLowerCase().includes('tornado');
        const color = isTor ? '#ff1744' : '#ffd600';
        return {
          color,
          weight: 2.5,
          opacity: 0.95,
          fillColor: color,
          fillOpacity: 0.04,
          dashArray: '6 4',
          className: 'spc-watch-polygon',
        };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties || {};
        const isTor = (p.event || '').toLowerCase().includes('tornado');
        const color = isTor ? '#ff1744' : '#ffd600';
        layer.bindPopup(
          `<div class="popup-event" style="--popup-color:${color}">${escapeHtml(p.event || 'Watch')}</div>` +
          (p.headline ? `<div class="popup-headline">${escapeHtml(p.headline)}</div>` : '') +
          `<div class="popup-meta">` +
            `<div><strong>Area:</strong> ${escapeHtml(p.areaDesc || '')}</div>` +
            `<div><strong>From:</strong> ${fmtDateTime(p.onset || p.effective)}</div>` +
            `<div><strong>Until:</strong> ${fmtDateTime(p.ends || p.expires)}</div>` +
          `</div>`,
          { maxWidth: 320 }
        );
      },
    }).addTo(S.map);
  }

  // -------------------- SPC storm reports (today) --------------------
  // Tiny CSV parser sufficient for SPC's day-files. Handles quoted fields.
  function parseCsv(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map(line => {
      const cols = splitCsvLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
      return row;
    });
  }
  function splitCsvLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === ',' && !inQ) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }

  async function fetchStormReports() {
    const base = 'https://www.spc.noaa.gov/climo/reports/';
    const types = [
      { file: 'today_torn.csv', kind: 'tornado' },
      { file: 'today_hail.csv', kind: 'hail' },
      { file: 'today_wind.csv', kind: 'wind' },
    ];
    try {
      const results = await Promise.all(types.map(t =>
        fetch(base + t.file, { cache: 'no-store' })
          .then(r => r.ok ? r.text() : '')
          .then(text => ({ kind: t.kind, rows: parseCsv(text) }))
          .catch(() => ({ kind: t.kind, rows: [] }))
      ));
      renderStormReports(results);
    } catch (e) {
      console.warn('storm reports fetch failed', e);
    }
  }

  function renderStormReports(buckets) {
    if (S.stormReportsLayer) { S.map.removeLayer(S.stormReportsLayer); S.stormReportsLayer = null; }
    if (!S.showStormReports) return;

    const KIND_COLOR = { tornado: '#ff1744', hail: '#00e676', wind: '#00b0ff' };
    const KIND_LABEL = { tornado: 'Tornado', hail: 'Hail', wind: 'Wind' };

    const group = L.layerGroup();
    for (const bucket of buckets || []) {
      const color = KIND_COLOR[bucket.kind];
      const kindLabel = KIND_LABEL[bucket.kind];
      for (const row of bucket.rows) {
        const lat = parseFloat(row.Lat || row.lat);
        const lng = parseFloat(row.Lon || row.lon);
        if (!isFinite(lat) || !isFinite(lng)) continue;

        const marker = L.circleMarker([lat, lng], {
          radius: 5,
          color: '#fff',
          weight: 1,
          fillColor: color,
          fillOpacity: 0.9,
          pane: 'stormReportsPane',
        });
        const detail = row['F_Scale'] || row.Size || row.Speed || '';
        marker.bindPopup(
          `<div class="popup-event" style="--popup-color:${color}">${escapeHtml(kindLabel)}${detail ? ' · ' + escapeHtml(detail) : ''}</div>` +
          (row.Location ? `<div class="popup-headline">${escapeHtml(row.Location)}, ${escapeHtml(row.County || '')} ${escapeHtml(row.State || '')}</div>` : '') +
          `<div class="popup-meta">` +
            (row.Time ? `<div><strong>Time:</strong> ${escapeHtml(row.Time)} UTC</div>` : '') +
            (row.Comments ? `<div>${escapeHtml(String(row.Comments).slice(0, 220))}</div>` : '') +
          `</div>`,
          { maxWidth: 280 }
        );
        group.addLayer(marker);
      }
    }
    S.stormReportsLayer = group;
    S.stormReportsLayer.addTo(S.map);
  }

  // -------------------- County boundaries (per-state, on demand) --------------------
  async function fetchCounties(state) {
    if (S.countiesCache[state]) {
      renderCounties();
      return;
    }
    try {
      const url = `https://api.weather.gov/zones?type=county&area=${encodeURIComponent(state)}&include_geometry=true`;
      const r = await fetch(url, { headers: { 'Accept': 'application/geo+json' } });
      if (!r.ok) throw new Error('counties ' + r.status);
      S.countiesCache[state] = await r.json();
      renderCounties();
    } catch (e) {
      console.warn('counties fetch failed', e);
    }
  }

  function renderCounties() {
    if (S.countiesLayer) { S.map.removeLayer(S.countiesLayer); S.countiesLayer = null; }
    if (!S.showCounties) return;
    const data = S.countiesCache[S.state];
    if (!data) return;

    S.countiesLayer = L.geoJSON(data, {
      pane: 'countiesPane',
      style: {
        color: '#9ba3b8',
        weight: 0.7,
        opacity: 0.4,
        fillOpacity: 0,
        interactive: false,
      },
    }).addTo(S.map);
  }

  // -------------------- search + pin --------------------
  async function geocode(query) {
    if (S.searchAbort) S.searchAbort.abort();
    S.searchAbort = new AbortController();
    const url = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json`
              + `?key=${CFG.MAPTILER_KEY}&limit=6&country=us`;
    const r = await fetch(url, { signal: S.searchAbort.signal });
    if (!r.ok) throw new Error('geocode ' + r.status);
    const data = await r.json();
    return data.features || [];
  }

  function renderSearchResults(features) {
    const box = $('search-results');
    if (!features.length) {
      box.innerHTML = `<div class="search-empty">No matches</div>`;
      return;
    }
    box.innerHTML = features.map((f, i) => {
      const name = escapeHtml(f.text || f.place_name || 'Unknown');
      const ctx = escapeHtml(f.place_name || '');
      return `
        <div class="search-result" data-idx="${i}">
          <div class="search-result-name">${name}</div>
          <div class="search-result-context">${ctx}</div>
        </div>`;
    }).join('');
    box.querySelectorAll('.search-result').forEach((el, idx) => {
      el.addEventListener('click', () => {
        const f = features[idx];
        const [lng, lat] = f.center || [];
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        dropPin(lat, lng, f.text || f.place_name, f.place_name);
        closeSearch();
      });
    });
  }

  function dropPin(lat, lng, name, context) {
    removePin();
    const icon = L.divIcon({
      className: 'triton-pin',
      html: `
        <svg viewBox="0 0 32 40">
          <path class="pin-shape" d="M16 1c-7.7 0-14 6.3-14 14 0 10.5 14 24 14 24s14-13.5 14-24c0-7.7-6.3-14-14-14z"/>
          <circle class="pin-dot" cx="16" cy="15" r="5"/>
        </svg>`,
      iconSize: [32, 40],
      iconAnchor: [16, 38],
      popupAnchor: [0, -34],
    });
    S.pinMarker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(S.map);
    const coords = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    S.pinMarker.bindPopup(`
      <div class="pin-popup-name">${escapeHtml(name || 'Pinned location')}</div>
      ${context ? `<div class="pin-popup-context">${escapeHtml(context)}</div>` : ''}
      <div class="pin-popup-coords">${coords}</div>
      <button class="pin-remove" data-pin-remove>Remove pin</button>
    `, { maxWidth: 280 });
    S.pinMarker.on('popupopen', (e) => {
      e.popup._contentNode.querySelector('[data-pin-remove]')
        ?.addEventListener('click', removePin);
    });
    const targetZoom = Math.max(S.map.getZoom(), 11);
    S.map.flyTo([lat, lng], targetZoom, { duration: 1.0 });
    setTimeout(() => S.pinMarker?.openPopup(), 700);
    $('clear-pin-btn').classList.remove('hidden');
  }

  function removePin() {
    if (S.pinMarker) {
      S.map.removeLayer(S.pinMarker);
      S.pinMarker = null;
    }
    $('clear-pin-btn').classList.add('hidden');
  }

  // -------------------- user location dot --------------------
  function showUserLocation(lat, lng, accuracy) {
    // Accuracy ring — translucent circle showing how confident we are.
    // This is also a guaranteed-visible fallback if the divIcon CSS fails.
    if (S.userLocCircle) S.map.removeLayer(S.userLocCircle);
    S.userLocCircle = L.circle([lat, lng], {
      radius: Math.max(50, accuracy || 100),
      color: '#2196f3',
      weight: 1,
      opacity: 0.5,
      fillColor: '#2196f3',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(S.map);

    if (S.userLocMarker) {
      S.userLocMarker.setLatLng([lat, lng]);
      return;
    }
    const icon = L.divIcon({
      className: 'user-location-dot',
      html: '<span class="ulp-pulse"></span><span class="ulp-dot"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    S.userLocMarker = L.marker([lat, lng], {
      icon,
      interactive: false,
      keyboard: false,
      zIndexOffset: 10000,
    }).addTo(S.map);
  }

  function openSearch() {
    S.searchOpen = true;
    $('search-panel').classList.add('open');
    $('search-btn').classList.add('active');
    setTimeout(() => $('search-input').focus(), 50);
  }
  function closeSearch() {
    S.searchOpen = false;
    $('search-panel').classList.remove('open');
    $('search-btn').classList.remove('active');
    // Drop stale results so re-opening doesn't flash old matches.
    $('search-results').innerHTML = '';
    if (S.searchAbort) { S.searchAbort.abort(); S.searchAbort = null; }
  }

  function startAlertRefresh() {
    if (S.alertTimer) clearInterval(S.alertTimer);
    S.alertTimer = setInterval(() => {
      if (!document.hidden) fetchAlerts(false);
    }, CFG.ALERT_REFRESH_MS);
  }

  // SPC products + storm reports refresh on their own cadence:
  //  - Outlook: ~30 min (SPC issues 6 updates/day for Day 1)
  //  - Watches: 60 s (along with NWS alerts)
  //  - Storm reports: 5 min while enabled
  function startSpcRefresh() {
    if (S.spcOutlookTimer) clearInterval(S.spcOutlookTimer);
    S.spcOutlookTimer = setInterval(() => {
      if (!document.hidden && S.showSpcOutlook) fetchSpcOutlook();
    }, 30 * 60_000);

    if (S.spcWatchesTimer) clearInterval(S.spcWatchesTimer);
    S.spcWatchesTimer = setInterval(() => {
      if (!document.hidden && S.showSpcWatches) fetchSpcWatches();
    }, 60_000);

    if (S.stormReportsTimer) clearInterval(S.stormReportsTimer);
    S.stormReportsTimer = setInterval(() => {
      if (!document.hidden && S.showStormReports) fetchStormReports();
    }, 5 * 60_000);
  }

  // -------------------- UI --------------------
  function initUI() {
    const timelineEl = document.querySelector('.timeline');

    // Play / pause
    $('play-pause').addEventListener('click', () => {
      S.playing = !S.playing;
      timelineEl.classList.toggle('playing', S.playing);
      if (S.playing) startAnim(); else stopAnim();
    });
    timelineEl.classList.toggle('playing', S.playing);

    // Speed
    document.querySelectorAll('.speed-btn').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.speed-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        S.speedMs = +b.dataset.speed;
        if (S.playing) startAnim();
      });
    });

    // Scrubber — pause animation while user drags
    const scrub = $('frame-scrub');
    let wasPlaying = false;
    let dragging = false;
    scrub.addEventListener('input', () => {
      if (!dragging) {
        dragging = true;
        wasPlaying = S.playing;
        if (S.playing) {
          S.playing = false;
          timelineEl.classList.remove('playing');
          stopAnim();
        }
      }
      setFrame(+scrub.value);
    });
    const endScrub = () => {
      if (!dragging) return;
      dragging = false;
      if (wasPlaying) {
        S.playing = true;
        timelineEl.classList.add('playing');
        startAnim();
      }
    };
    scrub.addEventListener('change', endScrub);
    scrub.addEventListener('pointerup', endScrub);
    scrub.addEventListener('pointercancel', endScrub);

    // Opacity
    const op = $('opacity');
    setRangeFill(op);
    $('opacity-value').textContent = op.value + '%';
    op.addEventListener('input', () => {
      S.opacity = +op.value / 100;
      $('opacity-value').textContent = op.value + '%';
      setRangeFill(op);
      const cur = S.radarLayers[S.radarIdx];
      if (cur) cur.layer.setOpacity(S.opacity);
    });

    // Base map style
    const baseSel = $('base-style');
    if (baseSel) {
      baseSel.value = S.baseStyle;
      baseSel.addEventListener('change', (e) => setBaseStyle(e.target.value));
    }

    // Color scheme
    $('color-scheme').addEventListener('change', (e) => {
      S.colorScheme = +e.target.value;
      rebuildRadarLayers();
    });

    // Smoothing
    $('smooth-toggle').addEventListener('change', (e) => {
      S.smooth = e.target.checked;
      rebuildRadarLayers();
    });

    // Forecast
    $('forecast-toggle').addEventListener('change', (e) => {
      S.showForecast = e.target.checked;
      rebuildRadarLayers();
    });

    // Alerts toggle
    $('alerts-toggle').addEventListener('change', (e) => {
      S.showAlerts = e.target.checked;
      if (!S.alertLayer) return;
      if (S.showAlerts) S.alertLayer.addTo(S.map);
      else S.map.removeLayer(S.alertLayer);
    });

    // Radar sites toggle
    const sitesToggle = $('sites-toggle');
    if (sitesToggle) {
      sitesToggle.addEventListener('change', (e) => {
        S.showRadarSites = e.target.checked;
        if (S.showRadarSites && !S.radarSitesData) {
          fetchRadarSites();
        } else {
          renderRadarSites();
        }
      });
    }

    // Coverage rings toggle
    const ringsToggle = $('rings-toggle');
    if (ringsToggle) {
      ringsToggle.addEventListener('change', (e) => {
        S.showCoverageRings = e.target.checked;
        renderCoverageRings();
      });
    }

    // SPC Day 1 outlook toggle
    const outlookToggle = $('outlook-toggle');
    if (outlookToggle) {
      outlookToggle.addEventListener('change', (e) => {
        S.showSpcOutlook = e.target.checked;
        if (S.showSpcOutlook && !S.spcOutlookData) {
          fetchSpcOutlook();
        } else {
          renderSpcOutlook();
        }
      });
    }

    // SPC watches toggle
    const watchesToggle = $('watches-toggle');
    if (watchesToggle) {
      watchesToggle.addEventListener('change', (e) => {
        S.showSpcWatches = e.target.checked;
        if (S.showSpcWatches && !S.spcWatchesData) {
          fetchSpcWatches();
        } else {
          renderSpcWatches();
        }
      });
    }

    // Storm reports toggle
    const reportsToggle = $('reports-toggle');
    if (reportsToggle) {
      reportsToggle.addEventListener('change', (e) => {
        S.showStormReports = e.target.checked;
        if (S.showStormReports) {
          fetchStormReports();
        } else {
          renderStormReports([]);
        }
      });
    }

    // County lines toggle
    const countiesToggle = $('counties-toggle');
    if (countiesToggle) {
      countiesToggle.addEventListener('change', (e) => {
        S.showCounties = e.target.checked;
        if (S.showCounties) {
          fetchCounties(S.state);
        } else {
          renderCounties();
        }
      });
    }

    // Bottom sheet handle (mobile only — on desktop the sheet is a side
    // panel that's dismissed via the X close button).
    $('sheet-handle').addEventListener('click', () => {
      if (window.innerWidth >= 768) return;
      toggleSheet();
    });
    $('sheet-close').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.innerWidth >= 768) {
        document.body.classList.add('sheet-hidden');
      } else {
        collapseSheet();
      }
    });

    // Top-bar alert pill: on desktop toggles the side panel; on mobile
    // toggles the expanded bottom sheet.
    $('alert-count').addEventListener('click', () => {
      if (window.innerWidth >= 768) {
        document.body.classList.toggle('sheet-hidden');
      } else {
        if (S.sheetExpanded) collapseSheet(); else expandSheet();
      }
    });

    // Filters
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        S.filter = chip.dataset.severity;
        renderAlertList();
      });
    });

    // Delegated click for alert cards — survives list re-renders.
    $('alert-list').addEventListener('click', (e) => {
      const card = e.target.closest('.alert-card');
      if (!card) return;
      const idx = +card.dataset.idx;
      const a = filteredAlerts()[idx];
      if (!a) return;
      if (!a.layer) {
        showToast('This alert has no map geometry');
        return;
      }
      const b = a.layer.getBounds();
      if (b.isValid()) {
        S.map.fitBounds(b.pad(0.2), { maxZoom: 10, animate: true });
        setTimeout(() => a.layer.openPopup(b.getCenter()), 350);
      }
      if (window.innerWidth < 768) collapseSheet();
    });

    // Layers panel toggle
    $('layers-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      S.layersOpen = !S.layersOpen;
      $('layers-panel').classList.toggle('open', S.layersOpen);
      $('layers-btn').classList.toggle('active', S.layersOpen);
    });

    // Search panel
    $('search-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (S.searchOpen) closeSearch(); else openSearch();
    });

    // Single outside-click handler closes whichever panel is open.
    document.addEventListener('click', (e) => {
      if (S.layersOpen) {
        const panel = $('layers-panel'), btn = $('layers-btn');
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
          S.layersOpen = false;
          panel.classList.remove('open');
          btn.classList.remove('active');
        }
      }
      if (S.searchOpen) {
        const panel = $('search-panel'), btn = $('search-btn');
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
          closeSearch();
        }
      }
    });

    const searchInput = $('search-input');
    const searchClear = $('search-clear');
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.trim();
      searchClear.classList.toggle('hidden', q.length === 0);
      clearTimeout(S.searchDebounce);
      if (!q) { $('search-results').innerHTML = ''; return; }
      if (q.length < 2) return;
      S.searchDebounce = setTimeout(() => {
        geocode(q)
          .then(renderSearchResults)
          .catch((err) => {
            if (err.name !== 'AbortError') {
              console.error(err);
              $('search-results').innerHTML = `<div class="search-empty">Search failed</div>`;
            }
          });
      }, 250);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = $('search-results').querySelector('.search-result');
        if (first) first.click();
      } else if (e.key === 'Escape') {
        closeSearch();
      }
    });
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchClear.classList.add('hidden');
      $('search-results').innerHTML = '';
      searchInput.focus();
    });

    // Clear pin (rail button only visible when a pin exists)
    $('clear-pin-btn').addEventListener('click', removePin);

    // Locate
    $('locate-btn').addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Geolocation not available', 'error');
        return;
      }
      $('locate-btn').classList.add('active');
      showToast('Locating…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          $('locate-btn').classList.remove('active');
          const { latitude, longitude, accuracy } = pos.coords;
          showUserLocation(latitude, longitude, accuracy);
          const targetZoom = Math.max(S.map.getZoom(), 10);
          S.map.flyTo([latitude, longitude], targetZoom, { duration: 1.2 });
          showToast(`Located (±${Math.round(accuracy)} m)`);
        },
        (err) => {
          $('locate-btn').classList.remove('active');
          console.warn('[Triton] geolocation error', err);
          const reasons = { 1: 'permission denied', 2: 'position unavailable', 3: 'timed out' };
          showToast(`Location: ${reasons[err.code] || err.message || 'failed'}`, 'error');
        },
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 30_000 }
      );
    });
  }

  function expandSheet() {
    S.sheetExpanded = true;
    $('alert-sheet').classList.add('expanded');
  }
  function collapseSheet() {
    S.sheetExpanded = false;
    $('alert-sheet').classList.remove('expanded');
  }
  function toggleSheet() {
    if (S.sheetExpanded) collapseSheet(); else expandSheet();
  }

  // -------------------- bootstrap --------------------
  function init() {
    if (!CFG.MAPTILER_KEY || /YOUR_KEY/i.test(CFG.MAPTILER_KEY)) {
      showToast('Add your MapTiler key in config.js', 'error');
    }
    initMap();
    initStateSelect();
    initUI();
    // Frame the initial view on the default state so the dropdown's first
    // value visually matches the map. Skip animation on boot (no fly).
    flyToState(S.state, { animate: false });
    initRadar();
    fetchAlerts(false);
    startAlertRefresh();
    fetchRadarSites();
    if (S.showSpcOutlook) fetchSpcOutlook();
    if (S.showSpcWatches) fetchSpcWatches();
    startSpcRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
