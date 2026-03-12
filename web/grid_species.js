const OBS_GEOJSON_URL = "../data/processed/phasianidae_full_grid.geojson";
const GRID_GEOJSON_URL = "./maille_10km_metrop.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";

// Priorité des champs espèce, dans l'esprit de species.js
const SPECIES_FIELDS = [
  "vernacularName_fr",
  "species",
  "scientificName",
  "taxon_name",
];

const OBS_GRID_FIELDS = ["grid_id", "cd_sig"];
const GRID_CODE_FIELDS = ["cd_sig", "grid_id", "id"];
const GRID_NAME_FIELDS = ["cd_sig", "grid_id", "id"];

const MASK_FILL_OPACITY = 0.90;

function colorBlueToRed(t) {
  const lerp = (a, b, x) => Math.round(a + (b - a) * x);
  const r = lerp(43, 230, t);
  const g = lerp(108, 0, t);
  const b = lerp(255, 0, t);
  return `rgb(${r},${g},${b})`;
}

const map = L.map("map", { zoomControl: true });

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap &copy; CARTO",
}).addTo(map);

const slider = document.getElementById("yearSlider");
const yearValue = document.getElementById("yearValue");
const titleYear = document.getElementById("titleYear");
const countValue = document.getElementById("countValue");

const speciesSelect = document.getElementById("speciesSelect");
const modeSelect = document.getElementById("modeSelect");
const speciesSearch = document.getElementById("speciesSearch");
const sortSelect = document.getElementById("sortSelect");
const playBtn = document.getElementById("playBtn");
const speedSelect = document.getElementById("speedSelect");

let allFeatures = [];
let gridGeo = null;
let gridLayer = null;

let maskLayer = null;
let outlineLayer = null;

let bySpecies = new Map();
let allSpecies = [];
let speciesCounts = new Map();

let globalMax = 1;

let isPlaying = false;
let playTimer = null;

// ==========================
// INFO BOX
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
      Échelle log
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

function getFirstExistingProp(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return null;
}

function getSpeciesLabel(feature) {
  const p = feature?.properties || {};
  const raw = getFirstExistingProp(p, SPECIES_FIELDS);
  if (!raw) return "Espèce inconnue";
  return String(raw).trim();
}

function normalizeGridCode(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  return s || null;
}

function getObsGridCode(feature) {
  const raw = getFirstExistingProp(feature?.properties, OBS_GRID_FIELDS);
  return normalizeGridCode(raw);
}

function getGridCodeFromPolygon(feature) {
  const raw = getFirstExistingProp(feature?.properties, GRID_CODE_FIELDS);
  return normalizeGridCode(raw);
}

function getGridNameFromPolygon(feature) {
  const raw = getFirstExistingProp(feature?.properties, GRID_NAME_FIELDS);
  return raw ? String(raw) : "Maille";
}

function valueToT(v, vmax) {
  if (!v || v <= 0) return 0;
  const a = Math.log(1 + v);
  const b = Math.log(1 + vmax);
  return b > 0 ? Math.min(1, a / b) : 0;
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
// MASK
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

  const b = outlineLayer.getBounds();
  map.fitBounds(b.pad(0.02));
  map.setMaxBounds(b.pad(0.10));
  map.options.maxBoundsViscosity = 1.0;

  const worldOuter = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];

  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geom = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const rings = collectOuterRings(geom);
  const holes = rings.map((ring) => ring.map(([lon, lat]) => [lat, lon]));

  maskLayer = L.polygon([worldOuter, ...holes], {
    stroke: false,
    fillColor: "#ffffff",
    fillOpacity: MASK_FILL_OPACITY,
    interactive: false,
  }).addTo(map);

  maskLayer.bringToFront();
  outlineLayer.bringToFront();
}

// ==========================
// SPECIES INDEX
// ==========================
function buildSpeciesIndex(features) {
  bySpecies = new Map();
  speciesCounts = new Map();

  for (const f of features) {
    const label = getSpeciesLabel(f);

    if (!bySpecies.has(label)) bySpecies.set(label, []);
    bySpecies.get(label).push(f);

    speciesCounts.set(label, (speciesCounts.get(label) || 0) + 1);
  }

  allSpecies = Array.from(bySpecies.keys());
}

function refreshSpeciesSelect() {
  const query = (speciesSearch?.value || "").trim().toLowerCase();
  const sortMode = sortSelect?.value || "count";

  let list = allSpecies.filter((s) => s.toLowerCase().includes(query));

  if (sortMode === "count") {
    list.sort((a, b) => (speciesCounts.get(b) || 0) - (speciesCounts.get(a) || 0));
  } else {
    list.sort((a, b) => a.localeCompare(b, "fr"));
  }

  const previous = speciesSelect.value || "__ALL__";
  speciesSelect.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "__ALL__";
  optAll.textContent = "Toutes les espèces";
  speciesSelect.appendChild(optAll);

  for (const s of list) {
    const opt = document.createElement("option");
    opt.value = s;
    const c = speciesCounts.get(s) || 0;
    opt.textContent = `${s} (${c.toLocaleString()})`;
    speciesSelect.appendChild(opt);
  }

  if ([...speciesSelect.options].some((o) => o.value === previous)) {
    speciesSelect.value = previous;
  } else {
    speciesSelect.value = "__ALL__";
  }
}

// ==========================
// COUNTS
// ==========================
function computeCounts(features, year, mode) {
  const counts = new Map();

  for (const f of features) {
    const y = getYear(f);
    if (y === null) continue;

    const keep = mode === "cumulative" ? y <= year : y === year;
    if (!keep) continue;

    const gridCode = getObsGridCode(f);
    if (!gridCode) continue;

    counts.set(gridCode, (counts.get(gridCode) || 0) + 1);
  }

  return counts;
}

function computeGlobalMax() {
  globalMax = 1;

  for (const selected of ["__ALL__", ...allSpecies]) {
    const candidates = selected === "__ALL__" ? allFeatures : (bySpecies.get(selected) || []);

    for (let y = Number(slider.min); y <= Number(slider.max); y += 1) {
      for (const mode of ["year", "cumulative"]) {
        const counts = computeCounts(candidates, y, mode);
        for (const v of counts.values()) {
          globalMax = Math.max(globalMax, v);
        }
      }
    }
  }
}

// ==========================
// RENDER
// ==========================
function refresh() {
  const year = Number(slider.value);
  const mode = modeSelect.value;
  const selected = speciesSelect.value;

  yearValue.textContent = String(year);
  titleYear.textContent = String(year);

  const candidates = selected === "__ALL__" ? allFeatures : (bySpecies.get(selected) || []);
  const counts = computeCounts(candidates, year, mode);

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
// PLAY
// ==========================
function stepYearForward() {
  const current = Number(slider.value);
  const maxY = Number(slider.max);
  const minY = Number(slider.min);

  const next = current >= maxY ? minY : current + 1;
  slider.value = String(next);
  refresh();
}

function setPlayState(playing) {
  isPlaying = playing;

  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }

  if (isPlaying) {
    playBtn.textContent = "⏸ Pause";
    const delay = Number(speedSelect.value) || 700;
    playTimer = setInterval(stepYearForward, delay);
  } else {
    playBtn.textContent = "▶ Play";
  }
}

function togglePlay() {
  setPlayState(!isPlaying);
}

// ==========================
// MAIN
// ==========================
async function main() {
  if (!slider || !speciesSelect || !modeSelect) {
    throw new Error("Missing required UI elements.");
  }

  await addFranceMask();

  {
    const res = await fetch(GRID_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${GRID_GEOJSON_URL}: ${res.status}`);
    const geo = await res.json();
    gridGeo = geo.type === "FeatureCollection" ? geo : { type: "FeatureCollection", features: [] };
  }

  {
    const res = await fetch(OBS_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${OBS_GEOJSON_URL}: ${res.status}`);
    const geo = await res.json();
    allFeatures = geo.features || [];
  }

  if (allFeatures.length === 0) {
    alert("Aucune observation trouvée dans le GeoJSON.");
    return;
  }

  const years = allFeatures.map(getYear).filter((y) => y !== null);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  slider.min = String(minY);
  slider.max = String(maxY);
  slider.value = String(minY);

  buildSpeciesIndex(allFeatures);
  refreshSpeciesSelect();
  computeGlobalMax();
  renderLegendScale(globalMax);

  speciesSelect.addEventListener("change", refresh);
  modeSelect.addEventListener("change", refresh);

  if (speciesSearch) {
    speciesSearch.addEventListener("input", () => {
      refreshSpeciesSelect();
      refresh();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      refreshSpeciesSelect();
      refresh();
    });
  }

  playBtn.addEventListener("click", togglePlay);

  speedSelect.addEventListener("change", () => {
    if (isPlaying) setPlayState(true);
  });

  slider.addEventListener("input", () => {
    if (isPlaying) setPlayState(false);
    refresh();
  });

  refresh();
}

main().catch((err) => {
  console.error(err);
  alert(err.message);
});