const OBS_GEOJSON_URL = "../data/processed/phasianidae_full_grid.geojson";
const GRID_GEOJSON_URL = "./maille_10km_metrop.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";
const OBS_GRID_FIELDS = ["grid_id", "cd_sig"];
const GRID_CODE_FIELDS = ["cd_sig", "grid_id", "id"];
const GRID_NAME_FIELDS = ["cd_sig", "grid_id", "id"];

// Blue -> Red (continuous, log-scaled)
function colorBlueToRed(t) {
  const lerp = (a, b, x) => Math.round(a + (b - a) * x);
  const r = lerp(43, 230, t);
  const g = lerp(108, 0, t);
  const b = lerp(255, 0, t);
  return `rgb(${r},${g},${b})`;
}

const map = L.map("map", { zoomControl: true });

// ==========================
// INFO BOX (hover)
// ==========================
const info = L.control({ position: "topright" });

info.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.id = "infoBox";
  div.innerHTML = `
    <div class="legend-title">Maille 10 km</div>
    <div class="muted">Survolez une maille</div>
  `;
  return div;
};

info.addTo(map);
L.DomEvent.disableClickPropagation(document.getElementById("infoBox"));
L.DomEvent.disableScrollPropagation(document.getElementById("infoBox"));

function updateInfoBox(gridName, gridCode, value) {
  const el = document.getElementById("infoBox");
  if (!el) return;

  if (gridName === null) {
    el.innerHTML = `
      <div class="legend-title">Maille 10 km</div>
      <div class="muted">Survolez une maille</div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="legend-title">${gridName}</div>
    <div class="muted">${gridCode ?? "—"}</div>
    <div style="margin-top:6px;"><b>Observations :</b> ${Number(value || 0).toLocaleString()}</div>
  `;
}

// Basemap
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

let gridGeo = null;
let gridLayer = null;
let yearIndex = new Map();   // year -> Map(gridCode -> count)
let years = [];
let globalMax = 1;

// ==========================
// LEGEND
// ==========================
const choroplethLegend = L.control({ position: "bottomright" });

choroplethLegend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div class="legend-title">Légende</div>
    <div class="legend-row"><b>Couleur</b> = nb d’observations</div>
    <div id="legendScale" style="margin-top:8px;"></div>
    <div class="muted" style="margin-top:6px;">
      Couleurs sur échelle log
    </div>
  `;
  return div;
};

choroplethLegend.addTo(map);

function renderLegendScale(vmax) {
  const el = document.getElementById("legendScale");
  if (!el) return;

  const ticksT = [0, 0.33, 0.66, 1.0];
  const tickValues = ticksT.map(t =>
    t === 0 ? 0 : Math.round(Math.expm1(t * Math.log1p(vmax)))
  );

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div style="
        flex:1;
        height:12px;
        border-radius:8px;
        background: linear-gradient(90deg,
          ${colorBlueToRed(0.0)},
          ${colorBlueToRed(0.5)},
          ${colorBlueToRed(1.0)}
        );
        border: 1px solid rgba(0,0,0,0.08);
      "></div>
    </div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:12px;color:#555;">
      <span>${tickValues[0]}</span>
      <span>${tickValues[1]}</span>
      <span>${tickValues[2]}</span>
      <span>${tickValues[3]}</span>
    </div>
  `;
}

// ==========================
// HELPERS
// ==========================
function getYear(feature) {
  const y = feature?.properties?.[YEAR_FIELD];
  if (y === undefined || y === null) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function getFirstExistingProperty(props, fields) {
  if (!props) return null;
  for (const f of fields) {
    if (props[f] !== undefined && props[f] !== null && props[f] !== "") {
      return props[f];
    }
  }
  return null;
}

function normalizeGridCode(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s || null;
}

function getObsGridCode(feature) {
  const raw = getFirstExistingProperty(feature?.properties, OBS_GRID_FIELDS);
  return normalizeGridCode(raw);
}

function getGridCodeFromPolygon(feature) {
  const raw = getFirstExistingProperty(feature?.properties, GRID_CODE_FIELDS);
  return normalizeGridCode(raw);
}

function getGridNameFromPolygon(feature) {
  const raw = getFirstExistingProperty(feature?.properties, GRID_NAME_FIELDS);
  return raw ? String(raw) : "Maille";
}

function valueToT(v, vmax) {
  if (!v || v <= 0) return 0;
  const a = Math.log(1 + v);
  const b = Math.log(1 + vmax);
  return b > 0 ? Math.min(1, a / b) : 0;
}

// ==========================
// FRANCE MASK
// ==========================
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

  const worldOuter = [
    [-90, -180], [-90, 180], [90, 180], [90, -180],
  ];

  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geom = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const rings = [];
  if (geom.type === "Polygon") rings.push(geom.coordinates[0]);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) rings.push(poly[0]);
  }

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

// ==========================
// INDEX
// ==========================
function buildYearIndex(obsFeatures) {
  yearIndex = new Map();
  const allYears = new Set();

  for (const f of obsFeatures) {
    const y = getYear(f);
    if (y === null) continue;

    const gridCode = getObsGridCode(f);
    if (!gridCode) continue;

    allYears.add(y);

    if (!yearIndex.has(y)) yearIndex.set(y, new Map());
    const m = yearIndex.get(y);
    m.set(gridCode, (m.get(gridCode) || 0) + 1);
  }

  years = Array.from(allYears).sort((a, b) => a - b);

  globalMax = 1;
  for (const m of yearIndex.values()) {
    for (const v of m.values()) globalMax = Math.max(globalMax, v);
  }
}

// ==========================
// RENDER
// ==========================
function renderYear(year) {
  yearValue.textContent = String(year);
  titleYear.textContent = String(year);

  const counts = yearIndex.get(year) || new Map();
  let total = 0;
  for (const v of counts.values()) total += v;
  countValue.textContent = `Total: ${total.toLocaleString()}`;

  if (gridLayer) map.removeLayer(gridLayer);

  gridLayer = L.geoJSON(gridGeo, {
    style: (feature) => {
      const gridCode = getGridCodeFromPolygon(feature);
      const v = gridCode ? (counts.get(gridCode) || 0) : 0;
      const t = valueToT(v, globalMax);

      return {
        color: "#666",
        weight: 0.35,
        opacity: 0.5,
        fillColor: v > 0 ? colorBlueToRed(t) : "#d9d9d9",
        fillOpacity: v > 0 ? 0.8 : 0.06,
      };
    },
    onEachFeature: (feature, layer) => {
      const gridCode = getGridCodeFromPolygon(feature);
      const gridName = getGridNameFromPolygon(feature);
      const v = gridCode ? (counts.get(gridCode) || 0) : 0;

      layer.on("mouseover", () => {
        layer.setStyle({ weight: 1.2, opacity: 1.0 });
        updateInfoBox(gridName, gridCode, v);
      });

      layer.on("mouseout", () => {
        gridLayer.resetStyle(layer);
        updateInfoBox(null, null, null);
      });
    },
  }).addTo(map);

  gridLayer.bringToFront();
  if (outlineLayer) outlineLayer.bringToFront();
}

// ==========================
// MAIN
// ==========================
async function main() {
  await addFranceMask();

  {
    const res = await fetch(GRID_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${GRID_GEOJSON_URL}: ${res.status}`);
    const geo = await res.json();

    if (geo.type === "FeatureCollection") {
      gridGeo = geo;
    } else {
      gridGeo = { type: "FeatureCollection", features: [] };
    }
  }

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
    alert("Aucune observation valide avec année + maille.");
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