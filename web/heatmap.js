// ==========================
// CONFIG
// ==========================
const GEOJSON_URL = "../data/processed/phasianidae_full_enriched.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";

// Heatmap tuning (you will likely tweak these)
const HEAT_RADIUS = 18;     // px
const HEAT_BLUR = 18;       // px
const HEAT_MIN_OPACITY = 0.25;

// Mask styling
const MASK_FILL_OPACITY = 0.90;
const MASK_FILL_COLOR = "#ffffff";

// Cumulative mode: true = <= year, false = == year
const IS_CUMULATIVE = true;

// Optional weight field (if you have one); otherwise fallback to 1
const WEIGHT_FIELD = null; // e.g. "weight" or "count" if exists

// ==========================
// MAP INIT
// ==========================
const map = L.map("map", { zoomControl: true });

// Basemap (keep your current one if you want; this is the same Carto light)
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap &copy; CARTO",
}).addTo(map);

// ==========================
// UI
// ==========================
const slider = document.getElementById("yearSlider");
const yearValue = document.getElementById("yearValue");
const countValue = document.getElementById("countValue");
const titleYear = document.getElementById("titleYear");

// ==========================
// LAYERS
// ==========================
let allFeatures = [];
let heatLayer = null;
let maskLayer = null;
let outlineLayer = null;

// ==========================
// HELPERS
// ==========================
function getYear(feature) {
  const y = feature?.properties?.[YEAR_FIELD];
  if (y === undefined || y === null) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function getWeight(feature) {
  if (!WEIGHT_FIELD) return 1;
  const w = Number(feature?.properties?.[WEIGHT_FIELD]);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function featureToHeatPoint(feature) {
  // Expect GeoJSON Point: [lon, lat]
  const coords = feature?.geometry?.coordinates;
  if (!coords || coords.length < 2) return null;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const w = getWeight(feature);
  return [lat, lon, w]; // [lat, lon, intensity]
}

function collectOuterRings(geometry) {
  const rings = [];
  if (!geometry) return rings;

  if (geometry.type === "Polygon") {
    if (geometry.coordinates?.[0]) rings.push(geometry.coordinates[0]);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates || []) {
      if (poly?.[0]) rings.push(poly[0]);
    }
  }
  return rings;
}

// ==========================
// LEGEND
// ==========================
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div class="legend-title">Légende</div>
    <div class="legend-row"><b>Type :</b> Heatmap (densité)</div>
    <div class="legend-row"><b>Mode :</b> ${IS_CUMULATIVE ? "Cumulatif (≤ année)" : "Année seule"}</div>
    <div class="legend-row"><b>Année :</b> <span id="legendYear">—</span></div>
    <div class="legend-row"><b>Points :</b> <span id="legendCount">—</span></div>
    <div class="legend-row muted" style="margin-top:6px;">
      Plus c’est “chaud”, plus la densité est forte.
    </div>
  `;
  return div;
};

legend.addTo(map);

function updateLegend(year, count) {
  const yEl = document.getElementById("legendYear");
  const cEl = document.getElementById("legendCount");
  if (yEl) yEl.textContent = String(year);
  if (cEl) cEl.textContent = count.toLocaleString();
}

// ==========================
// FRANCE MASK (METRO ONLY)
// ==========================
async function addFranceMask() {
  const res = await fetch(FRANCE_GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${FRANCE_GEOJSON_URL}: ${res.status}`);
  const france = await res.json();

  if (maskLayer) map.removeLayer(maskLayer);
  if (outlineLayer) map.removeLayer(outlineLayer);

  outlineLayer = L.geoJSON(france, {
    style: { weight: 2, opacity: 0.85, fillOpacity: 0 },
    interactive: false,
  }).addTo(map);

  const bounds = outlineLayer.getBounds();
  map.fitBounds(bounds.pad(0.02));
  map.setMaxBounds(bounds.pad(0.10));
  map.options.maxBoundsViscosity = 1.0;

  const worldOuter = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];

  const features = france.type === "FeatureCollection" ? france.features : [france];

  const holesLatLng = [];
  for (const f of features) {
    const geom = f.type === "Feature" ? f.geometry : f?.geometry;
    const rings = collectOuterRings(geom);
    for (const ring of rings) {
      holesLatLng.push(ring.map(([lon, lat]) => [lat, lon]));
    }
  }

  maskLayer = L.polygon([worldOuter, ...holesLatLng], {
    stroke: false,
    fillColor: MASK_FILL_COLOR,
    fillOpacity: MASK_FILL_OPACITY,
    interactive: false,
  }).addTo(map);

  maskLayer.bringToFront();
  outlineLayer.bringToFront();
}

// ==========================
// REFRESH (slider)
// ==========================
function refresh() {
  const year = Number(slider.value);
  yearValue.textContent = String(year);
  titleYear.textContent = String(year);

  const filtered = allFeatures.filter((f) => {
    const y = getYear(f);
    if (y === null) return false;
    return IS_CUMULATIVE ? y <= year : y === year;
  });

  const heatPoints = [];
  for (const f of filtered) {
    const p = featureToHeatPoint(f);
    if (p) heatPoints.push(p);
  }

  countValue.textContent = `Points: ${heatPoints.length.toLocaleString()}`;
  updateLegend(year, heatPoints.length);

  if (heatLayer) map.removeLayer(heatLayer);

  heatLayer = L.heatLayer(heatPoints, {
  radius: HEAT_RADIUS,
  blur: HEAT_BLUR,
  minOpacity: HEAT_MIN_OPACITY,
  maxZoom: 12,
  gradient: {
  0.00: "#2b6cff",
  0.50: "#b14cff",
  1.00: "#e60000"
}
}).addTo(map);

  // Keep borders above everything
  if (outlineLayer) outlineLayer.bringToFront();
}

// ==========================
// MAIN
// ==========================
async function main() {
  await addFranceMask();

  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${GEOJSON_URL}: ${res.status}`);
  const geo = await res.json();

  allFeatures = geo.features || [];
  if (allFeatures.length === 0) {
    alert("No features found in GeoJSON.");
    return;
  }

  const years = allFeatures.map(getYear).filter((y) => y !== null);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  slider.min = String(minY);
  slider.max = String(maxY);
  slider.value = String(minY);

  slider.addEventListener("input", refresh);
  refresh();
}

main().catch((err) => {
  console.error(err);
  alert(
    err.message +
      "\n\nTips:\n- Open via Live Server or `python -m http.server`\n- Check Console for errors\n- Verify file paths"
  );
});