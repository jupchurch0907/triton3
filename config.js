// Triton Weather Radar — runtime configuration.
// Base map is Carto + ESRI (keyless). The MapTiler key is retained only for
// the geocoding API used by the address-search panel — domain-restrict it
// in the MapTiler dashboard before deploying.
window.TRITON_CONFIG = {
  MAPTILER_KEY: "HndKYYtTX6F6AUPsnWJH",  // address search only
  BASE_STYLE: "dark",                    // dark | light | satellite
  DEFAULT_CENTER: [35.22, -97.44],       // Norman, OK
  DEFAULT_ZOOM: 7,
  DEFAULT_STATE: "OK",
  ALERT_REFRESH_MS: 60_000,
  RADAR_REFRESH_MS: 5 * 60_000,
  CONTACT: "jacobu2tech@gmail.com"       // sent in NWS Accept/User-Agent context
};
