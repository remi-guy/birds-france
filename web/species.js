// web/species.js
// Species-filtered clustered observations map (France metro mask + year slider + search/sort)

// ==========================
// CONFIG
// ==========================
const GEOJSON_URL = "../data/processed/phasianidae_full_enriched.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";

// Choose species field priority (adapted to your data)
const SPECIES_FIELDS = [
  "vernacularName_fr", // French common name
  "species",           // scientific name or label
  "scientificName",
  "taxon_name",
];

const MASK_FILL_OPACITY = 0.90;

// ==========================
// MAP INIT
// ==========================
const map = L.map("map", { zoomControl: true });

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

const speciesSelect = document.getElementById("speciesSelect");
const modeSelect = document.getElementById("modeSelect");

const speciesSearch = document.getElementById("speciesSearch");
const sortSelect = document.getElementById("sortSelect");

const playBtn = document.getElementById("playBtn");
const speedSelect = document.getElementById("speedSelect");

// ==========================
// LAYERS / STATE
// ==========================
let allFeatures = [];

let pointsLayer = null; // cluster

let maskLayer = null;
let outlineLayer = null;

// Index: species -> list of features
let bySpecies = new Map();
let allSpecies = [];
let speciesCounts = new Map(); // species -> count

let isPlaying = false;
let playTimer = null;

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

function buildClusteredPointsLayer(features) {
  const cluster = L.markerClusterGroup({
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 25,
    maxClusterRadius: 45,
  });

  const geo = L.geoJSON(features, {
    pointToLayer: (_feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 4,
        weight: 0,
        fillOpacity: 0.7,
        fillColor: "#2f6fed",
      }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.vernacularName_fr || p.species || "Espèce inconnue";
      const y = p.year ?? "—";
      const m = p.month ?? "—";
      const dep = p.nom ?? p.code_insee ?? "—";
      layer.bindPopup(
        `<b>${name}</b><br/>Année: ${y} | Mois: ${m}<br/>Département: ${dep}`
      );
    },
  });

  cluster.addLayer(geo);
  return cluster;
}

// ==========================
// FRANCE MASK (METRO ONLY)
// ==========================
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
// INDEX + UI POPULATION
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
  const sortMode = sortSelect?.value || "count"; // "count" or "alpha"

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
// REFRESH
// ==========================
function refresh() {
  const year = Number(slider.value);
  const mode = modeSelect.value; // "year" or "cumulative"
  const selected = speciesSelect.value;

  yearValue.textContent = String(year);

  const candidates = selected === "__ALL__" ? allFeatures : (bySpecies.get(selected) || []);

  const filtered = candidates.filter((f) => {
    const y = getYear(f);
    if (y === null) return false;
    return mode === "cumulative" ? y <= year : y === year;
  });

  countValue.textContent = `Points: ${filtered.length.toLocaleString()}`;

  if (pointsLayer) map.removeLayer(pointsLayer);
  pointsLayer = buildClusteredPointsLayer(filtered);
  pointsLayer.addTo(map);

  pointsLayer.bringToFront();
  if (outlineLayer) outlineLayer.bringToFront();
}

// ==========================
// MAIN
// ==========================
async function main() {
  // Basic sanity checks
  if (!slider || !speciesSelect || !modeSelect) {
    throw new Error("Missing required UI elements (check ids in species.html).");
  }

  await addFranceMask();

  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${GEOJSON_URL}: ${res.status}`);
  const geo = await res.json();

  allFeatures = geo.features || [];
  if (allFeatures.length === 0) {
    alert("No features found in GeoJSON.");
    return;
  }

  // Slider bounds
  const years = allFeatures.map(getYear).filter((y) => y !== null);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  slider.min = String(minY);
  slider.max = String(maxY);
  slider.value = String(minY);

  // Build index + populate dropdown
  buildSpeciesIndex(allFeatures);
  refreshSpeciesSelect();

  // Events
  
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
  // If currently playing, restart interval with new speed
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