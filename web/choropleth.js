const OBS_GEOJSON_URL = "../data/processed/phasianidae_full_enriched.geojson";
const DEPS_GEOJSON_URL = "./departements.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";

// Try multiple property names (because your sources may vary)
const OBS_DEP_FIELDS = ["dep", "departement", "department", "code_dep", "code_dept", "dept", "code_insee", "insee_dep"];
const DEP_CODE_FIELDS = ["code_insee", "CODE_DEPT", "code", "CODE"];
const DEP_NAME_FIELDS = ["nom", "NOM", "NOM_DEPT", "name", "NAME"];

// Blue -> Red (continuous, log-scaled)
function colorBlueToRed(t) {
  // t in [0,1]
  // Simple interpolation between blue and red
  const lerp = (a, b, x) => Math.round(a + (b - a) * x);
  const r = lerp(43, 230, t);   // 0: blue-ish, 1: red
  const g = lerp(108, 0, t);
  const b = lerp(255, 0, t);
  return `rgb(${r},${g},${b})`;
}

const map = L.map("map", { zoomControl: true });

// Basemap (keep consistent with your other pages)
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap &copy; CARTO",
}).addTo(map);

const slider = document.getElementById("yearSlider");
const yearValue = document.getElementById("yearValue");
const titleYear = document.getElementById("titleYear");
const countValue = document.getElementById("countValue");

let outlineLayer = null;
let maskLayer = null;

let depsGeo = null;                 // departments polygons GeoJSON
let depLayer = null;                // current choropleth layer
let yearIndex = new Map();          // year -> Map(depCode -> count)
let years = [];
let globalMax = 1;

// ==========================
// LEGEND (Choropleth)
// ==========================
const choroplethLegend = L.control({ position: "bottomright" });

choroplethLegend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div class="legend-title">Légende</div>
    <div class="legend-row"><b>Couleur</b> = nb d’observations</div>
    <div id="legendScale" style="margin-top:8px;"></div>
    <div class="muted" style="margin-top:6px;">
      Échelle log pour éviter que 2–3 départements dominent.
    </div>
  `;
  return div;
};

choroplethLegend.addTo(map);

function renderLegendScale(vmax) {
  const el = document.getElementById("legendScale");
  if (!el) return;

  // 5 bins on a log scale
  const bins = 5;
  const values = [];
  for (let i = 0; i < bins; i++) {
    const t = i / (bins - 1);              // 0..1
    const v = Math.round(Math.expm1(t * Math.log1p(vmax))); // inverse of log scaling
    values.push(v);
  }

  const rows = values
    .map((v, i) => {
      const t = valueToT(v, vmax); // re-use your scaling
      const c = colorBlueToRed(t);
      return `
        <div class="legend-row">
          <span style="width:14px;height:14px;border-radius:3px;background:${c};display:inline-block;"></span>
          <span>${v.toLocaleString()}</span>
        </div>
      `;
    })
    .join("");

  el.innerHTML = rows;
}

// --- Helpers ---
function getYear(feature) {
  const y = feature?.properties?.[YEAR_FIELD];
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function getFirstExistingProp(obj, keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return null;
}

function normalizeDepCode(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();

  // Handle "2A"/"2B" if present
  if (/^(2A|2B)$/i.test(s)) return s.toUpperCase();

  // Extract first 2 digits if string contains INSEE-like code
  // e.g. "33000" -> "33", "75..." -> "75"
  const m2 = s.match(/^(\d{2})/);
  if (m2) return m2[1];

  // Handle "20" sometimes used for Corsica (we can't split without more info)
  if (s === "20") return "20";

  return null;
}

function getObsDepCode(feature) {
  const p = feature?.properties || {};
  const raw = getFirstExistingProp(p, OBS_DEP_FIELDS);

  // If code_insee is a commune code (5 digits), first 2 digits = department
  const dep = normalizeDepCode(raw);
  return dep;
}

function getDepCodeFromPolygon(depFeature) {
  const p = depFeature?.properties || {};
  const raw = getFirstExistingProp(p, DEP_CODE_FIELDS);
  return normalizeDepCode(raw) || (raw ? String(raw) : null);
}

function getDepNameFromPolygon(depFeature) {
  const p = depFeature?.properties || {};
  const raw = getFirstExistingProp(p, DEP_NAME_FIELDS);
  return raw ? String(raw) : "Département";
}

// log scaling to avoid “everything red” when a few deps have huge counts
function valueToT(v, vmax) {
  if (!v || v <= 0) return 0;
  const a = Math.log(1 + v);
  const b = Math.log(1 + vmax);
  return b > 0 ? Math.min(1, a / b) : 0;
}

// --- France mask (reuse your existing logic, simplified) ---
async function addFranceMask() {
  const res = await fetch(FRANCE_GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${FRANCE_GEOJSON_URL}: ${res.status}`);
  const france = await res.json();

  if (outlineLayer) map.removeLayer(outlineLayer);
  outlineLayer = L.geoJSON(france, {
    style: { weight: 2, opacity: 0.85, fillOpacity: 0 },
    interactive: false,
  }).addTo(map);

  const b = outlineLayer.getBounds();
  map.fitBounds(b.pad(0.02));
  map.setMaxBounds(b.pad(0.10));
  map.options.maxBoundsViscosity = 1.0;

  // Optional mask (if you want the “outside France hidden” effect)
  // Keep it if you like your current look; otherwise remove this block.
  const worldOuter = [
    [-90, -180], [-90, 180], [90, 180], [90, -180],
  ];

  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geom = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const rings = [];
  if (geom.type === "Polygon") rings.push(geom.coordinates[0]);
  if (geom.type === "MultiPolygon") for (const poly of geom.coordinates) rings.push(poly[0]);

  const holes = rings.map(r => r.map(([lon, lat]) => [lat, lon]));

  if (maskLayer) map.removeLayer(maskLayer);
  maskLayer = L.polygon([worldOuter, ...holes], {
    stroke: false,
    fillColor: "#ffffff",
    fillOpacity: 0.85,
    interactive: false,
  }).addTo(map);

  maskLayer.bringToFront();
  outlineLayer.bringToFront();
}

// --- Build index: year -> depCode -> count ---
function buildYearIndex(obsFeatures) {
  yearIndex = new Map();
  const allYears = new Set();

  for (const f of obsFeatures) {
    const y = getYear(f);
    if (y === null) continue;

    const dep = getObsDepCode(f);
    if (!dep) continue;

    allYears.add(y);

    if (!yearIndex.has(y)) yearIndex.set(y, new Map());
    const m = yearIndex.get(y);
    m.set(dep, (m.get(dep) || 0) + 1);
  }

  years = Array.from(allYears).sort((a, b) => a - b);

  // Compute global max across all years for stable colors
  globalMax = 1;
  for (const m of yearIndex.values()) {
    for (const v of m.values()) globalMax = Math.max(globalMax, v);
  }
}

// --- Choropleth layer ---
function renderYear(year) {
  yearValue.textContent = String(year);
  titleYear.textContent = String(year);

  const counts = yearIndex.get(year) || new Map();
  let total = 0;
  for (const v of counts.values()) total += v;
  countValue.textContent = `Total: ${total.toLocaleString()}`;

  if (depLayer) map.removeLayer(depLayer);

  depLayer = L.geoJSON(depsGeo, {
    style: (feature) => {
      const depCode = getDepCodeFromPolygon(feature);
      const v = depCode ? (counts.get(depCode) || 0) : 0;

      const t = valueToT(v, globalMax);
      return {
        color: "#666",
        weight: 0.6,
        opacity: 0.6,
        fillColor: colorBlueToRed(t),
        fillOpacity: v > 0 ? 0.75 : 0.08,
      };
    },
    onEachFeature: (feature, layer) => {
      const depCode = getDepCodeFromPolygon(feature);
      const depName = getDepNameFromPolygon(feature);
      const v = depCode ? (counts.get(depCode) || 0) : 0;

      layer.bindTooltip(
        `<b>${depName}</b> (${depCode ?? "—"})<br/>Observations: ${v.toLocaleString()}`,
        { sticky: true }
      );
      layer.on("mouseover", () => layer.setStyle({ weight: 2, opacity: 1.0 }));
layer.on("mouseout", () => layer.setStyle({ weight: 0.6, opacity: 0.6 }));
    },
  }).addTo(map);

  depLayer.bringToFront();
  if (outlineLayer) outlineLayer.bringToFront();
}

// --- Main ---
async function main() {
  await addFranceMask();

  // Load departments polygons
  {
    const res = await fetch(DEPS_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${DEPS_GEOJSON_URL}: ${res.status}`);
    depsGeo = await res.json();
  }

  // Load observations
  let obsFeatures = [];
  {
    const res = await fetch(OBS_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${OBS_GEOJSON_URL}: ${res.status}`);
    const geo = await res.json();
    obsFeatures = geo.features || [];
  }

  buildYearIndex(obsFeatures);
  renderLegendScale(globalMax);

  if (years.length === 0) {
    alert("No valid (year, department) pairs found. Check your observation department field.");
    return;
  }

  slider.min = String(years[0]);
  slider.max = String(years[years.length - 1]);
  slider.value = String(years[0]);

  slider.addEventListener("input", () => {
    renderYear(Number(slider.value));
  });

  renderYear(Number(slider.value));
}

main().catch((err) => {
  console.error(err);
  alert(err.message);
});