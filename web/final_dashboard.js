// ==========================
// CONFIG
// ==========================
const OBS_GEOJSON_URL = "../data/processed/phasianidae_full_grid.geojson";
const GRID_GEOJSON_URL = "./maille_10km_metrop.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

const YEAR_FIELD = "year";

const OBS_GRID_FIELDS = ["cd_sig", "grid_id"];
const GRID_CODE_FIELDS = ["cd_sig", "grid_id", "id"];
const GRID_NAME_FIELDS = ["cd_sig", "grid_id", "id"];

const SPECIES_FIELDS = [
  "vernacularName_fr",
  "species",
  "scientificName",
  "taxon_name",
];

const EXTERNAL_EVENTS = [
  { year: 2007, label: "Smartphones" },
  { year: 2012, label: "Apps growth" },
  { year: 2018, label: "Citizen science" },
];

// ==========================
// MAP
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

const speciesSearch = document.getElementById("speciesSearch");
const speciesSelect = document.getElementById("speciesSelect");
const sortSelect = document.getElementById("sortSelect");
const modeSelect = document.getElementById("modeSelect");

const playBtn = document.getElementById("playBtn");
const speedSelect = document.getElementById("speedSelect");

const insightList = document.getElementById("insightList");
const chartCanvas = document.getElementById("timeChart");

// ==========================
// STATE
// ==========================
let obsFeatures = [];
let gridGeo = null;

let years = [];
let bySpecies = new Map();
let speciesCounts = new Map();
let allSpecies = [];

let outlineLayer = null;
let maskLayer = null;
let gridLayer = null;

let isPlaying = false;
let playTimer = null;
let chartInstance = null;

// ==========================
// INFO BOX
// ==========================
const info = L.control({ position: "topright" });

info.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.id = "infoBox";
  div.innerHTML = `
    <div class="legend-title">10 km grid cell</div>
    <div class="muted">Hover over a cell</div>
  `;
  return div;
};

info.addTo(map);

setTimeout(() => {
  const infoBox = document.getElementById("infoBox");
  if (infoBox) {
    L.DomEvent.disableClickPropagation(infoBox);
    L.DomEvent.disableScrollPropagation(infoBox);
  }
}, 0);

function updateInfoBox(gridName, gridCode, value, speciesLabel, year) {
  const el = document.getElementById("infoBox");
  if (!el) return;

  if (gridName === null) {
    el.innerHTML = `
      <div class="legend-title">10 km grid cell</div>
      <div class="muted">Hover over a cell</div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="legend-title">${gridName}</div>
    <div class="muted">Grid code: ${gridCode ?? "—"}</div>
    <div style="margin-top:6px;"><b>Species:</b> ${speciesLabel}</div>
    <div style="margin-top:6px;"><b>Year:</b> ${year}</div>
    <div style="margin-top:6px;"><b>Observations:</b> ${Number(value || 0).toLocaleString()}</div>
  `;
}

// ==========================
// LEGEND
// ==========================
const choroplethLegend = L.control({ position: "bottomright" });

choroplethLegend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div class="legend-title">Legend</div>
    <div class="legend-row"><b>Color</b> = number of observations</div>
    <div id="legendScale" style="margin-top:8px;"></div>
    <div class="muted" style="margin-top:6px;">Log-scaled color intensity</div>
  `;
  return div;
};

choroplethLegend.addTo(map);

function renderLegendScale(vmax) {
  const el = document.getElementById("legendScale");
  if (!el) return;

  const ticksT = [0, 0.33, 0.66, 1.0];
  const tickValues = ticksT.map((t) =>
    t === 0 ? 0 : Math.round(Math.expm1(t * Math.log1p(vmax)))
  );

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <div
        style="
          flex:1;
          height:12px;
          border-radius:8px;
          background: linear-gradient(
            90deg,
            ${colorBlueToRed(0.0)},
            ${colorBlueToRed(0.5)},
            ${colorBlueToRed(1.0)}
          );
          border: 1px solid rgba(0,0,0,0.08);
        "
      ></div>
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
// COLORS
// ==========================
function colorBlueToRed(t) {
  const lerp = (a, b, x) => Math.round(a + (b - a) * x);
  const r = lerp(43, 230, t);
  const g = lerp(108, 0, t);
  const b = lerp(255, 0, t);
  return `rgb(${r},${g},${b})`;
}

function valueToT(v, vmax) {
  if (!v || v <= 0) return 0;
  const a = Math.log(1 + v);
  const b = Math.log(1 + vmax);
  return b > 0 ? Math.min(1, a / b) : 0;
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
  for (const field of fields) {
    const value = props[field];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

function getSpeciesLabel(feature) {
  const raw = getFirstExistingProperty(feature?.properties, SPECIES_FIELDS);
  return raw ? String(raw).trim() : "Unknown species";
}

function normalizeGridCode(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
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
  return raw ? String(raw) : "Grid cell";
}

function getCurrentSpeciesLabel() {
  return speciesSelect.value === "__ALL__" ? "All species" : speciesSelect.value;
}

// ==========================
// FRANCE MASK
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

  if (outlineLayer) map.removeLayer(outlineLayer);
  if (maskLayer) map.removeLayer(maskLayer);

  outlineLayer = L.geoJSON(france, {
    style: { weight: 2, opacity: 0.85, fillOpacity: 0 },
    interactive: false,
  }).addTo(map);

  const bounds = outlineLayer.getBounds();
  map.fitBounds(bounds.pad(0.02));
  map.setMaxBounds(bounds.pad(0.1));
  map.options.maxBoundsViscosity = 1.0;

  const worldOuter = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];

  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geometry = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const rings = collectOuterRings(geometry);
  const holes = rings.map((ring) => ring.map(([lon, lat]) => [lat, lon]));

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
// SPECIES INDEX
// ==========================
function buildSpeciesIndex(features) {
  bySpecies = new Map();
  speciesCounts = new Map();

  for (const feature of features) {
    const label = getSpeciesLabel(feature);

    if (!bySpecies.has(label)) {
      bySpecies.set(label, []);
    }

    bySpecies.get(label).push(feature);
    speciesCounts.set(label, (speciesCounts.get(label) || 0) + 1);
  }

  allSpecies = Array.from(bySpecies.keys());
}

function refreshSpeciesSelect() {
  const query = (speciesSearch.value || "").trim().toLowerCase();
  const sortMode = sortSelect.value || "count";
  const previousValue = speciesSelect.value || "__ALL__";

  let filteredSpecies = allSpecies.filter((name) =>
    name.toLowerCase().includes(query)
  );

  if (sortMode === "count") {
    filteredSpecies.sort(
      (a, b) => (speciesCounts.get(b) || 0) - (speciesCounts.get(a) || 0)
    );
  } else {
    filteredSpecies.sort((a, b) => a.localeCompare(b, "fr"));
  }

  speciesSelect.innerHTML = "";

  const allOption = document.createElement("option");
  allOption.value = "__ALL__";
  allOption.textContent = "All species";
  speciesSelect.appendChild(allOption);

  for (const name of filteredSpecies) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = `${name} (${(speciesCounts.get(name) || 0).toLocaleString()})`;
    speciesSelect.appendChild(option);
  }

  const optionValues = [...speciesSelect.options].map((option) => option.value);
  speciesSelect.value = optionValues.includes(previousValue) ? previousValue : "__ALL__";
}

// ==========================
// COUNTS
// ==========================
function getCandidateFeatures(selectedSpecies) {
  if (selectedSpecies === "__ALL__") return obsFeatures;
  return bySpecies.get(selectedSpecies) || [];
}

function buildFilteredGridCounts(year, mode, selectedSpecies) {
  const candidates = getCandidateFeatures(selectedSpecies);
  const counts = new Map();
  let total = 0;

  for (const feature of candidates) {
    const y = getYear(feature);
    if (y === null) continue;

    const matches = mode === "cumulative" ? y <= year : y === year;
    if (!matches) continue;

    const gridCode = getObsGridCode(feature);
    if (!gridCode) continue;

    counts.set(gridCode, (counts.get(gridCode) || 0) + 1);
    total += 1;
  }

  return { counts, total };
}

function getCurrentMax(counts) {
  let vmax = 1;
  for (const value of counts.values()) {
    vmax = Math.max(vmax, value);
  }
  return vmax;
}

function buildTimeSeries(selectedSpecies) {
  const candidates = getCandidateFeatures(selectedSpecies);
  const countsByYear = new Map();

  for (const feature of candidates) {
    const year = getYear(feature);
    if (year === null) continue;
    countsByYear.set(year, (countsByYear.get(year) || 0) + 1);
  }

  const sortedYears = Array.from(countsByYear.keys()).sort((a, b) => a - b);
  const values = sortedYears.map((year) => countsByYear.get(year) || 0);

  return { years: sortedYears, values };
}

// ==========================
// MAP RENDER
// ==========================
function renderMap(year, mode, selectedSpecies) {
  const { counts, total } = buildFilteredGridCounts(year, mode, selectedSpecies);
  const currentMax = getCurrentMax(counts);

  renderLegendScale(currentMax);

  yearValue.textContent = String(year);
  countValue.textContent = `Total observations: ${total.toLocaleString()}`;

  if (gridLayer) {
    map.removeLayer(gridLayer);
  }

  gridLayer = L.geoJSON(gridGeo, {
    style: (feature) => {
      const gridCode = getGridCodeFromPolygon(feature);
      const value = gridCode ? counts.get(gridCode) || 0 : 0;
      const t = valueToT(value, currentMax);

      return {
        color: "#666",
        weight: 0.3,
        opacity: 0.45,
        fillColor: value > 0 ? colorBlueToRed(t) : "#d9d9d9",
        fillOpacity: value > 0 ? 0.82 : 0.03,
      };
    },
    onEachFeature: (feature, layer) => {
      const gridCode = getGridCodeFromPolygon(feature);
      const gridName = getGridNameFromPolygon(feature);
      const value = gridCode ? counts.get(gridCode) || 0 : 0;

      layer.on("mouseover", () => {
        layer.setStyle({ weight: 1.1, opacity: 1.0 });
        updateInfoBox(gridName, gridCode, value, getCurrentSpeciesLabel(), year);
      });

      layer.on("mouseout", () => {
        gridLayer.resetStyle(layer);
        updateInfoBox(null, null, null, null, null);
      });
    },
  }).addTo(map);

  gridLayer.bringToFront();
  if (outlineLayer) outlineLayer.bringToFront();
}

// ==========================
// CHART
// ==========================
const eventLinesPlugin = {
  id: "eventLinesPlugin",
  afterDatasetsDraw(chart, _args, pluginOptions) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales.x) return;

    const events = pluginOptions?.events || [];
    const labels = chart.data.labels || [];

    ctx.save();
    ctx.font = "11px system-ui, Arial, sans-serif";
    ctx.textBaseline = "top";

    for (const event of events) {
      const xIndex = labels.findIndex((label) => Number(label) === Number(event.year));
      if (xIndex === -1) continue;

      const x = scales.x.getPixelForValue(xIndex);

      ctx.beginPath();
      ctx.strokeStyle = "rgba(120,120,120,0.7)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(80,80,80,0.9)";
      ctx.fillText(event.label, Math.min(x + 4, chartArea.right - 95), chartArea.top + 6);
    }

    ctx.restore();
  },
};

Chart.register(eventLinesPlugin);

function renderChart(selectedSpecies) {
  const series = buildTimeSeries(selectedSpecies);

  if (chartInstance) {
    chartInstance.destroy();
  }

  chartInstance = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels: series.years,
      datasets: [
        {
          label: getCurrentSpeciesLabel(),
          data: series.values,
          borderColor: "rgb(47, 111, 237)",
          backgroundColor: "rgba(47, 111, 237, 0.12)",
          borderWidth: 2,
          tension: 0.2,
          fill: true,
          pointRadius: 2,
          pointHoverRadius: 4,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      plugins: {
        legend: { display: true },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y ?? 0;
              return `Observations: ${value.toLocaleString()}`;
            },
          },
        },
        eventLinesPlugin: {
          events: EXTERNAL_EVENTS,
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Year" },
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: "Number of observations" },
        },
      },
    },
  });
}

// ==========================
// INSIGHTS
// ==========================
function formatSignedPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function updateInsights(year, mode, selectedSpecies) {
  const series = buildTimeSeries(selectedSpecies);
  const selectedLabel = selectedSpecies === "__ALL__" ? "all species" : selectedSpecies;

  if (series.years.length === 0) {
    insightList.innerHTML = "<li>No data available for the current selection.</li>";
    return;
  }

  const currentIndex = series.years.findIndex((y) => y === year);
  const currentValue = currentIndex >= 0 ? series.values[currentIndex] : 0;

  let previousValue = null;
  if (currentIndex > 0) {
    previousValue = series.values[currentIndex - 1];
  }

  const firstYear = series.years[0];
  const firstValue = series.values[0] || 0;

  let yearOverYearText = "No previous year available for comparison.";
  if (previousValue !== null) {
    const pct =
      previousValue === 0
        ? currentValue > 0 ? 100 : 0
        : ((currentValue - previousValue) / previousValue) * 100;

    yearOverYearText = `Compared with the previous available year, the change is ${formatSignedPercent(pct)}.`;
  }

  let longTermText = "Long-term comparison is not available.";
  if (firstYear !== year) {
    const pct =
      firstValue === 0
        ? currentValue > 0 ? 100 : 0
        : ((currentValue - firstValue) / firstValue) * 100;

    longTermText = `Since ${firstYear}, observations for ${selectedLabel} changed by ${formatSignedPercent(pct)}.`;
  }

  const modeText =
    mode === "cumulative"
      ? "The map uses cumulative counts up to the selected year."
      : "The map uses observations from the selected year only.";

  insightList.innerHTML = `
    <li><b>${year}</b>: ${currentValue.toLocaleString()} observations for <b>${selectedLabel}</b>.</li>
    <li>${yearOverYearText}</li>
    <li>${longTermText}</li>
    <li>${modeText}</li>
  `;
}

// ==========================
// GLOBAL REFRESH
// ==========================
function refresh() {
  const year = Number(slider.value);
  const mode = modeSelect.value;
  const selectedSpecies = speciesSelect.value || "__ALL__";

  renderMap(year, mode, selectedSpecies);
  renderChart(selectedSpecies);
  updateInsights(year, mode, selectedSpecies);
}

// ==========================
// PLAYBACK
// ==========================
function stepYearForward() {
  const current = Number(slider.value);
  const maxYear = Number(slider.max);
  const minYear = Number(slider.min);

  const nextYear = current >= maxYear ? minYear : current + 1;
  slider.value = String(nextYear);
  refresh();
}

function setPlayState(playing) {
  isPlaying = playing;

  if (playTimer) {
    clearInterval(playTimer);
    playTimer = null;
  }

  if (isPlaying) {
    playBtn.textContent = "Pause";
    const delay = Number(speedSelect.value) || 700;
    playTimer = setInterval(stepYearForward, delay);
  } else {
    playBtn.textContent = "Play";
  }
}

function togglePlay() {
  setPlayState(!isPlaying);
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
    gridGeo = geo.type === "FeatureCollection"
      ? geo
      : { type: "FeatureCollection", features: [] };
  }

  {
    const res = await fetch(OBS_GEOJSON_URL);
    if (!res.ok) throw new Error(`Failed to fetch ${OBS_GEOJSON_URL}: ${res.status}`);
    const geo = await res.json();
    obsFeatures = geo.features || [];
  }

  if (obsFeatures.length === 0) {
    throw new Error("No observation features were found in the dataset.");
  }

  years = obsFeatures
    .map(getYear)
    .filter((year) => year !== null)
    .sort((a, b) => a - b);

  if (years.length === 0) {
    throw new Error("No valid year field was found in the dataset.");
  }

  buildSpeciesIndex(obsFeatures);
  refreshSpeciesSelect();

  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);

  slider.min = String(minYear);
  slider.max = String(maxYear);
  slider.value = String(minYear);

  yearValue.textContent = String(minYear);
  countValue.textContent = "Total observations: —";

  speciesSelect.addEventListener("change", () => {
    if (isPlaying) setPlayState(false);
    refresh();
  });

  modeSelect.addEventListener("change", () => {
    if (isPlaying) setPlayState(false);
    refresh();
  });

  sortSelect.addEventListener("change", () => {
    refreshSpeciesSelect();
    refresh();
  });

  speciesSearch.addEventListener("input", () => {
    refreshSpeciesSelect();
    refresh();
  });

  slider.addEventListener("input", () => {
    if (isPlaying) setPlayState(false);
    refresh();
  });

  playBtn.addEventListener("click", togglePlay);

  speedSelect.addEventListener("change", () => {
    if (isPlaying) setPlayState(true);
  });

  refresh();
}

main().catch((error) => {
  console.error(error);
  alert(
    `${error.message}\n\nTips:\n- Run the project with Live Server or python -m http.server\n- Check that all GeoJSON paths are correct\n- Verify that phasianidae_full_grid.geojson contains year, cd_sig, and species fields`
  );
});