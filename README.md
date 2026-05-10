# Triton 3 Weather Radar

A slick, mobile-first browser weather radar with animated NEXRAD overlay
and live NWS alerts. Pure static site — no backend, no build step.

## Stack

- **Leaflet 1.9** (map engine, via CDN)
- **MapTiler** dark tiles (base map)
- **RainViewer** public API (radar tiles, past + 30-min forecast)
- **api.weather.gov** (NWS active alerts as GeoJSON)

## Quick start

1. Open this folder in VS Code.
2. Install the **Live Server** extension (Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

Your MapTiler key is already wired in `config.js`.

## Files

```
config.js     ← API key + defaults (state, center, refresh intervals)
index.html    ← UI shell
style.css     ← dark glass theme, fully responsive
app.js        ← map, radar animation, alerts, filtering, geolocation
```

## What it does

- Animated NEXRAD radar with **past frames + 30-min forecast** (toggleable)
- Play/pause, 1× / 2× / 4× speed, scrubber, opacity slider, color-scheme picker
- **NWS active alerts** rendered as colored polygons + sortable/filterable list
- Severity filter chips: **All / Extreme / Severe / Moderate / Minor**
- Alerts auto-refresh every 60 s; radar refreshes every 5 min (paused when tab hidden)
- Tap an alert card to fly the map to it and open the popup
- "Locate me" button uses browser geolocation
- Layers panel (opacity, color scheme, smoothing, forecast on/off, alert visibility)
- Mobile bottom-sheet UI; desktop side-panel layout (auto-switches at 768 px)
- Glass-morphism dark theme — no light mode

## Notes / known limitations

- **Zone-only alerts** (e.g. small craft advisories) have no polygon geometry.
  They still appear in the alert list with a **`zone-only`** badge but are not
  drawn on the map. NWS publishes zone shapes separately; integrating those is
  a future enhancement.
- The MapTiler key is shipped to the browser. **Domain-restrict it** in your
  MapTiler dashboard before deploying to production.
- Browsers ignore `User-Agent` overrides from `fetch`, so we send
  `Accept: application/geo+json` only. NWS allows this without an API key.

## Deploying to Cloudflare Pages

1. Create a new GitHub repo and push these files.
2. In Cloudflare Pages → **Create project** → **Connect to Git** → pick the repo.
3. Build settings: **None** (static site).
   - Build command: *(leave blank)*
   - Build output directory: `/`
4. Deploy. Then domain-restrict your MapTiler key in the MapTiler dashboard
   to the `*.pages.dev` (and any custom) domain.

## Add to Android home screen

Open the deployed site in Chrome → **⋮ → Add to Home screen**. The
`theme-color` and viewport meta tags give it a near-app feel. (A full PWA
manifest + service worker is a candidate for Phase 3 — left out for now
because radar tiles are time-sensitive and need careful cache rules.)
