# Project Brief: Web-Based Weather Radar & Alerts App

## Overview
Build a responsive, browser-based weather radar and alerts viewer that works on both desktop (PC) and mobile (Android Chrome). This is a **pure frontend static web app** — no backend required. It should be deployable to Cloudflare Pages via a GitHub repo.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Vanilla HTML/CSS/JS** (no build step) | Keep it simple to start; can migrate to React/Vite later |
| Map Library | **Leaflet.js** (via CDN) | v1.9.x |
| Base Map Tiles | **MapTiler** | API key will be provided by user |
| Radar Overlay | **RainViewer Leaflet Plugin** | Free, animated, multi-frame |
| Weather Alerts | **NWS API** (`api.weather.gov`) | Free, no key required |
| Styling | Custom CSS | Dark theme, utility-first, mobile-first |

---

## File Structure

```
/weather-radar/
  index.html         ← single entry point
  style.css          ← all styles
  app.js             ← all JavaScript logic
  README.md
```

---

## Features to Build (in priority order)

### Phase 1 — Core (build first)
1. **Full-screen interactive map** centered on Norman, Oklahoma (`35.22, -97.44`) at zoom level 7
2. **MapTiler base map tiles** — use the `streets` or `outdoor` style
3. **Animated NEXRAD radar overlay** via the RainViewer Leaflet plugin
   - Past frames (looping animation)
   - Play/pause control
   - Opacity slider
4. **NWS Active Alerts overlay**
   - Fetch from `https://api.weather.gov/alerts/active?area=OK` (default to Oklahoma; make state configurable)
   - Render alert polygons as GeoJSON on the map
   - Color-code by severity:
     - Extreme → `#FF0000` (red)
     - Severe → `#FF6600` (orange)
     - Moderate → `#FFFF00` (yellow)
     - Minor → `#00AAFF` (blue)
   - Clickable popups showing: event type, headline, start/end time, description
5. **Auto-refresh alerts** every 60 seconds

### Phase 2 — UX Polish
6. **Floating control panel** (top-left or bottom-left, non-overlapping map)
   - State selector dropdown (default: OK)
   - Radar opacity slider
   - Alert layer toggle
   - Radar animation play/pause + speed control
7. **Alert sidebar or bottom sheet** listing active alerts (scrollable)
   - On desktop: right-side panel
   - On mobile: collapsible bottom sheet
8. **Responsive layout**
   - Desktop: map fills viewport, side panel floats
   - Mobile: map fills viewport, controls are compact floating buttons
9. **Dark theme** — appropriate for radar viewing at night, use deep navy/charcoal backgrounds with high-contrast accent colors

### Phase 3 — Nice to Have (later)
10. **PWA manifest** (`manifest.json` + service worker stub) so it can be added to Android home screen
11. **User location button** — fly to user's GPS location using browser geolocation API
12. **County/zone boundaries** — add NWS county warning area boundaries as a toggleable layer

---

## API Details

### MapTiler
- Tile URL pattern: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=MAPTILER_KEY`
- The user will supply their API key — use a `config.js` file or a `const MAPTILER_KEY = 'YOUR_KEY_HERE'` placeholder at the top of `app.js`

### RainViewer
- Plugin repo: https://github.com/mwasil/Leaflet.Rainviewer
- Load via CDN or copy the plugin JS into the project
- API is free, no key required
- Provides past radar frames + animation controls

### NWS Alerts API
- Base URL: `https://api.weather.gov/alerts/active`
- Query by state: `?area=OK`
- Returns GeoJSON — plug directly into `L.geoJSON()`
- No authentication required
- Docs: https://www.weather.gov/documentation/services-web-api

---

## Design Direction

- **Dark theme** — deep charcoal or near-black backgrounds (`#0d0d0f` or similar)
- **Radar-room aesthetic** — feels like a real meteorologist's display
- **Accent color**: electric cyan or amber for UI controls
- **Typography**: clean, readable, monospace or technical-feeling for data labels
- **Controls**: minimal floating panels that don't obstruct the map
- **Mobile**: full-screen map is the priority; controls collapse to icon buttons

---

## Constraints & Notes

- No npm/node required for Phase 1 — everything via CDN so it opens with Live Server immediately
- Must work in Chrome on Android (no exotic browser APIs)
- Leaflet version: 1.9.x
- Keep `app.js` well-commented for future expansion
- Do not hard-code the MapTiler API key — use a clearly marked placeholder or a `config` object at the top of the file

---

## What to Build First

Start with `index.html` that:
1. Loads Leaflet CSS + JS from CDN
2. Loads the RainViewer Leaflet plugin
3. Loads `style.css` and `app.js`
4. Has a single `<div id="map">` filling the viewport

Then build `app.js` to initialize the map, add MapTiler tiles, add the RainViewer radar layer, and fetch + render NWS alerts as GeoJSON.

Build `style.css` last to apply the dark theme and responsive layout.
