// ==========================
// CONFIG
// ==========================
const GEOJSON_URL = "../data/processed/phasianidae_full_enriched.geojson";
const FRANCE_GEOJSON_URL = "./france_metropole.geojson";

// In your GeoJSON properties, this must exist:
const YEAR_FIELD = "year";
const titleYear = document.getElementById("titleYear");
// If you have an IGN key, put it here (otherwise it will fallback)
const IGN_API_KEY = ""; // <-- optional

// Mask opacity (this is what you were changing)
const MASK_FILL_OPACITY = 0.90; // try 0.6 / 0.9 / 1.0

// ==========================
// MAP INIT
// ==========================
const map = L.map("map", { 
  zoomControl: true,
  minZoom: 5,
  maxZoom: 12
});

// Basemap (French labels): try IGN first, else fallback Carto
function addBaseMap() {
  if (IGN_API_KEY && IGN_API_KEY.trim().length > 0) {
    // IGN WMTS (often French labels). Needs a valid API key.
    // Note: Some IGN offers require authentication depending on plan.
    const ignUrl =
      "https://wxs.ign.fr/" + encodeURIComponent(IGN_API_KEY) +
      "/geoportail/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0" +
      "&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal" +
      "&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}" +
      "&FORMAT=image/png";

    L.tileLayer(ignUrl, {
      maxZoom: 19,
      attribution: "&copy; IGN"
    }).addTo(map);

    return;
  }

  // Fallback (clean but may show some labels in English)
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap &copy; CARTO'
  }).addTo(map);
}

addBaseMap();

// ==========================
// UI
// ==========================
const slider = document.getElementById("yearSlider");
const yearValue = document.getElementById("yearValue");
const countValue = document.getElementById("countValue");

// ==========================
// LAYERS
// ==========================
let allFeatures = [];
let pointsLayer = null;
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

function buildPointsLayer(features) {
  const cluster = L.markerClusterGroup({
    chunkedLoading: true,      // avoids freezing with lots of points
    chunkInterval: 50,
    chunkDelay: 25,
    maxClusterRadius: 45
  });

  const geo = L.geoJSON(features, {
    pointToLayer: (feature, latlng) => {
      const marker = L.circleMarker(latlng, {
        radius: 4,
        weight: 0,
        fillOpacity: 0.7,
        fillColor: "#2f6fed"
      });
      return marker;
    },
    onEachFeature: (feature, layer) => {
      const p = feature.properties || {};
      const name = p.vernacularName_fr || p.species || "Espèce inconnue";
      const y = p.year ?? "—";
      const m = p.month ?? "—";
      const dep = p.nom ?? p.code_insee ?? "—";
      layer.bindPopup(
        `<b>${name}</b><br/>Année: ${y} | Mois: ${m}<br/>Département: ${dep}`
      );
    }
  });

  cluster.addLayer(geo);
  return cluster;
}

// ==========================
// LEGEND
// ==========================
const legend = L.control({ position: "bottomright" });

legend.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
  <div class="legend-title">Légende</div>

  <div class="legend-row">
    <span class="legend-dot"></span>
    <span>Observation individuelle</span>
  </div>

  <div class="legend-row">
    <span style="width:12px;height:12px;border-radius:50%;background:#7bdc6c;display:inline-block;"></span>
    <span>Cluster (peu d'observations)</span>
  </div>

  <div class="legend-row">
    <span style="width:12px;height:12px;border-radius:50%;background:#f1c40f;display:inline-block;"></span>
    <span>Cluster moyen</span>
  </div>

  <div class="legend-row">
    <span style="width:12px;height:12px;border-radius:50%;background:#e67e22;display:inline-block;"></span>
    <span>Cluster dense</span>
  </div>

  <div class="legend-row"><b>Famille :</b> Phasianidae</div>
  <div class="legend-row"><b>Année :</b> <span id="legendYear">—</span></div>
  <div class="legend-row"><b>Points :</b> <span id="legendCount">—</span></div>
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

  // Outline (France border)
  outlineLayer = L.geoJSON(france, {
    style: { weight: 2, opacity: 0.8, fillOpacity: 0 },
    interactive: false
  }).addTo(map);

  const b = outlineLayer.getBounds();
  map.fitBounds(b.pad(0.02));
  map.setMaxBounds(b.pad(0.10));
  map.options.maxBoundsViscosity = 1.0;

  // Build "world" polygon
  const worldOuter = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];

  // Extract geometry (Polygon or MultiPolygon)
  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geom = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const rings = [];
  if (geom.type === "Polygon") rings.push(geom.coordinates[0]);
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) rings.push(poly[0]);
  }

  // Convert [lon,lat] -> [lat,lon]
  const holes = rings.map(ring => ring.map(([lon, lat]) => [lat, lon]));

  // Remove previous mask if any
  if (maskLayer) map.removeLayer(maskLayer);

  // IMPORTANT: mask added AFTER basemap, so it stays above it.
  maskLayer = L.polygon([worldOuter, ...holes], {
    stroke: false,
    fillColor: "#ffffff",
    fillOpacity: MASK_FILL_OPACITY, // <--- THIS MUST CHANGE VISUALLY
    interactive: false
  }).addTo(map);

  // Force layer order: mask above basemap, outline above mask
  maskLayer.bringToFront();
  outlineLayer.bringToFront();

  // Debug: confirm
  console.log("Mask opacity:", MASK_FILL_OPACITY, "maskLayer:", maskLayer);
}

// ==========================
// REFRESH (slider)
// ==========================
function refresh() {
  const year = Number(slider.value);

  yearValue.textContent = String(year);
  titleYear.textContent = year;

  const filtered = allFeatures.filter(f => getYear(f) <= year);

  countValue.textContent = `Points: ${filtered.length.toLocaleString()}`;
  updateLegend(year, filtered.length);

  if (pointsLayer) map.removeLayer(pointsLayer);
  pointsLayer = buildPointsLayer(filtered);
  pointsLayer.addTo(map);

  pointsLayer.bringToFront();
  if (outlineLayer) outlineLayer.bringToFront();
}

// ==========================
// MAIN
// ==========================
async function main() {
  // 1) Add France mask first (above basemap, below points)
  await addFranceMask();

  // 2) Load observations
  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`Failed to fetch ${GEOJSON_URL}: ${res.status}`);
  const geo = await res.json();

  allFeatures = geo.features || [];
  if (allFeatures.length === 0) {
    alert("No features found in GeoJSON.");
    return;
  }

  // 3) Slider min/max from data
  const years = allFeatures.map(getYear).filter(y => y !== null);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);

  slider.min = String(minY);
  slider.max = String(maxY);
  slider.value = String(minY);

  slider.addEventListener("input", () => {
  requestAnimationFrame(refresh);
});

  refresh();
}

main().catch(err => {
  console.error(err);
  alert(
    err.message +
    "\n\nTips:\n- Open via Live Server or `python -m http.server`\n- Check Console for errors\n- Verify file paths"
  );
});