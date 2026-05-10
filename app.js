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

  const SEVERITY_ORDER = { Extreme: 0, Severe: 1, Moderate: 2, Minor: 3, Unknown: 4 };
  const SEVERITY_COLORS = {
    Extreme: '#ff1744',
    Severe:  '#ff6d00',
    Moderate:'#ffd600',
    Minor:   '#00b0ff',
    Unknown: '#8e94a8'
  };

  // Single transparent pixel — used when a radar tile fails to load
  const BLANK_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=';

  // -------------------- shared state --------------------
  const S = {
    map: null,
    baseLayer: null,
    labelsLayer: null,
    userLocMarker: null,
    baseStyle: CFG.MAPTILER_STYLE || 'dataviz-dark',
    radarLayers: [],          // [{layer, time, isFuture}]
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
    filter: 'all',
    state: CFG.DEFAULT_STATE || 'OK',

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
      zoomSnap: 0.5,
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

    setBaseStyle(S.baseStyle);
    addLabelsOverlay();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAnim();
      } else {
        if (S.playing) startAnim();
        fetchAlerts(false);
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
        maxNativeZoom: 18,
        attribution: '<a href="https://carto.com/attributions" target="_blank">© Carto</a>',
        crossOrigin: true,
        errorTileUrl: BLANK_PNG,
      }
    ).addTo(S.map);
  }

  function setBaseStyle(styleId) {
    S.baseStyle = styleId;
    const retina = (window.devicePixelRatio || 1) > 1.4 ? '@2x' : '';
    // Satellite/hybrid use jpg; vector-derived dark styles use png
    const ext = (styleId === 'satellite' || styleId === 'hybrid') ? 'jpg' : 'png';
    const url = `https://api.maptiler.com/maps/${styleId}/{z}/{x}/{y}${retina}.${ext}?key=${CFG.MAPTILER_KEY}`;
    const newLayer = L.tileLayer(url, {
      attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OSM</a> · NWS · RainViewer',
      maxZoom: 18,
      maxNativeZoom: 18,
      crossOrigin: true,
      zIndex: 1,
      errorTileUrl: BLANK_PNG,
    });
    newLayer.addTo(S.map);
    if (S.baseLayer) {
      // Remove old once new has had a moment to start loading
      const old = S.baseLayer;
      setTimeout(() => S.map.removeLayer(old), 250);
    }
    S.baseLayer = newLayer;
  }

  // -------------------- state selector --------------------
  function initStateSelect() {
    const sel = $('state-select');
    sel.innerHTML = STATES.map(([code, name]) =>
      `<option value="${code}"${code === S.state ? ' selected' : ''}>${code} — ${name}</option>`
    ).join('');
    sel.addEventListener('change', (e) => {
      S.state = e.target.value;
      fetchAlerts(true);
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
    const data = await r.json();
    S.radarHost = data.host;

    const past = data.radar?.past || [];
    const nowcast = S.showForecast ? (data.radar?.nowcast || []) : [];
    const frames = [
      ...past.map(f => ({ ...f, isFuture: false })),
      ...nowcast.map(f => ({ ...f, isFuture: true })),
    ];

    // Tear down old layers
    for (const r of S.radarLayers) S.map.removeLayer(r.layer);
    S.radarLayers = [];

    if (!frames.length) return;

    for (const f of frames) {
      const url = `${S.radarHost}${f.path}/512/{z}/{x}/{y}/${S.colorScheme}/${S.smooth ? 1 : 0}_1.png`;
      const layer = L.tileLayer(url, {
        opacity: 0,
        zIndex: 200,
        crossOrigin: true,
        // RainViewer publishes radar tiles up to native zoom 12 — let Leaflet
        // upscale that highest tile when the user zooms in further so the
        // radar stays visible (slightly soft) instead of disappearing.
        maxZoom: 18,
        maxNativeZoom: 12,
        errorTileUrl: BLANK_PNG,
      });
      layer.addTo(S.map);
      S.radarLayers.push({ layer, time: f.time, isFuture: f.isFuture });
    }

    const scrub = $('frame-scrub');
    scrub.max = Math.max(0, S.radarLayers.length - 1);
    setRangeFill(scrub);

    // Start at the most recent past frame
    const lastPastIdx = Math.max(0, past.length - 1);
    setFrame(lastPastIdx);

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
    try {
      const url = `https://api.weather.gov/alerts/active?area=${encodeURIComponent(S.state)}`;
      const r = await fetch(url, {
        headers: { 'Accept': 'application/geo+json' },
        cache: 'no-store',
      });
      if (!r.ok) throw new Error('NWS ' + r.status);
      const geo = await r.json();
      renderAlerts(geo, flyTo);
    } catch (e) {
      console.error('alerts fetch failed', e);
      showToast('Alert refresh failed', 'error');
    }
  }

  const severityOf = (f) => f?.properties?.severity || 'Unknown';

  function renderAlerts(geo, flyTo) {
    if (S.alertLayer) S.map.removeLayer(S.alertLayer);
    S.alertLayer = null;
    S.allAlerts = [];

    const features = geo.features || [];
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
    if (S.alertLayer) {
      S.alertLayer.eachLayer(l => {
        const id = l.feature?.id;
        if (id) layersByFeature.set(id, l);
      });
    }

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

    if (flyTo && S.alertLayer && polyFeatures.length) {
      try {
        const b = S.alertLayer.getBounds();
        if (b.isValid()) S.map.fitBounds(b.pad(0.15), { maxZoom: 9, animate: true });
      } catch (e) {}
    }
  }

  function updateAlertCount() {
    const n = S.allAlerts.length;
    $('alert-count-num').textContent = n;
    $('alert-count').classList.toggle('zero', n === 0);
  }

  function renderAlertList() {
    const list = $('alert-list');
    const filtered = S.filter === 'all'
      ? S.allAlerts
      : S.allAlerts.filter(a => a.severity === S.filter);

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

    list.querySelectorAll('.alert-card').forEach((card, idx) => {
      card.addEventListener('click', () => {
        const a = filtered[idx];
        if (a.layer) {
          const b = a.layer.getBounds();
          if (b.isValid()) {
            S.map.fitBounds(b.pad(0.2), { maxZoom: 10, animate: true });
            // Open the popup once the fly-to is settled
            setTimeout(() => a.layer.openPopup(b.getCenter()), 350);
          }
          if (window.innerWidth < 768) collapseSheet();
        } else {
          showToast('This alert has no map geometry');
        }
      });
    });
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
    if (!S.userLocMarker) {
      const icon = L.divIcon({
        className: 'user-location-dot',
        html: '<span class="ulp-pulse"></span><span class="ulp-core"></span>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      S.userLocMarker = L.marker([lat, lng], {
        icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 500,
      }).addTo(S.map);
    } else {
      S.userLocMarker.setLatLng([lat, lng]);
    }
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
  }

  function startAlertRefresh() {
    if (S.alertTimer) clearInterval(S.alertTimer);
    S.alertTimer = setInterval(() => {
      if (!document.hidden) fetchAlerts(false);
    }, CFG.ALERT_REFRESH_MS);
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
      fetchRadar().catch(console.error);
    });

    // Smoothing
    $('smooth-toggle').addEventListener('change', (e) => {
      S.smooth = e.target.checked;
      fetchRadar().catch(console.error);
    });

    // Forecast
    $('forecast-toggle').addEventListener('change', (e) => {
      S.showForecast = e.target.checked;
      fetchRadar().catch(console.error);
    });

    // Alerts toggle
    $('alerts-toggle').addEventListener('change', (e) => {
      S.showAlerts = e.target.checked;
      if (!S.alertLayer) return;
      if (S.showAlerts) S.alertLayer.addTo(S.map);
      else S.map.removeLayer(S.alertLayer);
    });

    // Bottom sheet handle (mobile)
    $('sheet-handle').addEventListener('click', () => {
      if (window.innerWidth >= 768) return;
      toggleSheet();
    });
    $('sheet-close').addEventListener('click', (e) => {
      e.stopPropagation();
      collapseSheet();
    });

    // Top-bar alert pill
    $('alert-count').addEventListener('click', () => {
      if (window.innerWidth >= 768) {
        $('alert-list').scrollTop = 0;
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

    // Layers panel toggle
    $('layers-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      S.layersOpen = !S.layersOpen;
      $('layers-panel').classList.toggle('open', S.layersOpen);
      $('layers-btn').classList.toggle('active', S.layersOpen);
    });
    document.addEventListener('click', (e) => {
      if (!S.layersOpen) return;
      const panel = $('layers-panel');
      const btn = $('layers-btn');
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      S.layersOpen = false;
      panel.classList.remove('open');
      btn.classList.remove('active');
    });

    // Search panel
    $('search-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (S.searchOpen) closeSearch(); else openSearch();
    });
    document.addEventListener('click', (e) => {
      if (!S.searchOpen) return;
      const panel = $('search-panel');
      const btn = $('search-btn');
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closeSearch();
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
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          $('locate-btn').classList.remove('active');
          const { latitude, longitude, accuracy } = pos.coords;
          showUserLocation(latitude, longitude, accuracy);
          const targetZoom = Math.max(S.map.getZoom(), 9);
          S.map.flyTo([latitude, longitude], targetZoom, { duration: 1.2 });
        },
        () => {
          $('locate-btn').classList.remove('active');
          showToast('Could not get your location', 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60_000 }
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
    initRadar();
    fetchAlerts(false);
    startAlertRefresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
