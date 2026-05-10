// Triton Weather Radar — runtime configuration.
// IMPORTANT: when you deploy this to Cloudflare Pages, domain-restrict your
// MapTiler key in the MapTiler dashboard so it can only be used from your
// production hostname. The key is visible to anyone who loads the page.
window.TRITON_CONFIG = {
  MAPTILER_KEY: "HndKYYtTX6F6AUPsnWJH",
  MAPTILER_STYLE: "dataviz-dark", // dataviz-dark (neutral) | basic-v2-dark | streets-v2-dark
  DEFAULT_CENTER: [35.22, -97.44],   // Norman, OK
  DEFAULT_ZOOM: 7,
  DEFAULT_STATE: "OK",
  ALERT_REFRESH_MS: 60_000,
  RADAR_REFRESH_MS: 5 * 60_000,
  CONTACT: "jacobu2tech@gmail.com"    // sent in NWS Accept/User-Agent context
};
