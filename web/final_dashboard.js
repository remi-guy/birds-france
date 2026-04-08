// ==========================
// CONFIGURATION
// ==========================
const URL_OBSERVATIONS = "../data/processed/phasianidae_filtered.geojson";
const URL_GRILLE = "./maille_10km_metrop.geojson";
const URL_FRANCE = "./france_metropole.geojson";

const CHAMP_ANNEE = "year";

const CHAMPS_GRILLE_OBS = ["cd_sig", "grid_id"];
const CHAMPS_CODE_GRILLE = ["cd_sig", "grid_id", "id"];
const CHAMPS_NOM_GRILLE = ["cd_sig", "grid_id", "id"];

const CHAMPS_ESPECE = [
  "vernacularName_fr",
  "species",
  "scientificName",
  "taxon_name",
];

const MAPPING_ESPECES = {
  "Lyrurus tetrix": "Tétras lyre",
  "Tetrao urogallus": "Grand tétras",
  "Lagopus muta": "Lagopède alpin",
  "Tetrastes bonasia": "Gélinotte des bois",
  "Alectoris graeca": "Perdrix bartavelle",
};

const ESPECES_UI = [
  {value: "Tétras lyre (Lyrurus tetrix)", image: "./images/tetras_lyre.jpg",},
  {value: "Grand tétras (Tetrao urogallus)", image: "./images/grand_tetras.jpg",},
  {value: "Lagopède alpin (Lagopus muta)", image: "./images/lagopede.jpg",},
  {value: "Gélinotte des bois (Tetrastes bonasia)", image: "./images/gelinotte.jpg",},
  {value: "Perdrix bartavelle (Alectoris graeca)", image: "./images/perdrix.jpeg",},
];

const EVENEMENTS_EXTERNES = [
  {
    annee: 2003,
    label: "Canicule 2003",
    categorie: "écologique",
    couleur: "#e67e22",
    important: true,
    description: "Grand épisode de chaleur en Europe, utile comme repère environnemental.",
  },
  {
    annee: 2007,
    label: "Essor smartphones",
    categorie: "technologique",
    couleur: "#2563eb",
    important: true,
    description: "Début de la diffusion massive des smartphones.",
  },
  {
    annee: 2012,
    label: "Boom des applis",
    categorie: "technologique",
    couleur: "#2563eb",
    important: true,
    description: "Les applications mobiles de signalement deviennent plus accessibles.",
  },
  {
    annee: 2015,
    label: "Plateformes participatives",
    categorie: "sociétal",
    couleur: "#7c3aed",
    important: true,
    description: "Les plateformes de sciences participatives deviennent plus visibles.",
  },
  {
    annee: 2018,
    label: "Boom participatif",
    categorie: "sociétal",
    couleur: "#7c3aed",
    important: true,
    description: "Les sciences participatives prennent une place plus importante.",
  },
  {
    annee: 2020,
    label: "COVID / confinements",
    categorie: "sociétal",
    couleur: "#dc2626",
    important: true,
    description: "Les comportements d’observation peuvent avoir été modifiés.",
  },
];

// ==========================
// CARTE
// ==========================
const carte = L.map("map", { zoomControl: true });

const fondClair = L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }
);

const fondSatellite = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 19,
    attribution: "Tiles &copy; Esri",
    opacity: 0.2,
  }
);

// fond par défaut
fondSatellite.addTo(carte);

// sélecteur de fond
L.control.layers(
  {
    "Clair": fondClair,
    "Satellite": fondSatellite,
  },
  null,
  { position: "topleft", collapsed: false }
).addTo(carte);

// ==========================
// ÉLÉMENTS UI
// ==========================
const sliderAnnee = document.getElementById("yearSlider");
const valeurAnnee = document.getElementById("yearValue");
const valeurTotal = document.getElementById("countValue");

const rechercheEspece = document.getElementById("speciesSearch");
const selectEspece = document.getElementById("speciesSelect");
const selectTri = document.getElementById("sortSelect");
const selectMode = document.getElementById("modeSelect");

const boutonPlay = document.getElementById("playBtn");
const selectVitesse = document.getElementById("speedSelect");

const listeInsights = document.getElementById("insightList");
const canvasGraphique = document.getElementById("timeChart");
const galerieEspeces = document.getElementById("speciesGallery");

// ==========================
// ÉTAT GLOBAL
// ==========================
let featuresObservations = [];
let geoGrille = null;

let listeAnnees = [];
let indexParEspece = new Map();
let compteParEspece = new Map();
let toutesLesEspeces = [];

let coucheContour = null;
let coucheMasque = null;
let coucheGrille = null;

let lectureAutoActive = false;
let timerLecture = null;
let graphiqueInstance = null;

// ==========================
// BOÎTE D’INFO
// ==========================
const controleInfo = L.control({ position: "topright" });

controleInfo.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.id = "infoBox";
  div.innerHTML = `
    <div class="legend-title">Maille 10 km</div>
    <div class="muted">Survolez une maille</div>
  `;
  return div;
};

controleInfo.addTo(carte);

setTimeout(() => {
  const infoBox = document.getElementById("infoBox");
  if (infoBox) {
    L.DomEvent.disableClickPropagation(infoBox);
    L.DomEvent.disableScrollPropagation(infoBox);
  }
}, 0);

function mettreAJourInfoBox(nomGrille, codeGrille, valeur, libelleEspece, annee) {
  const el = document.getElementById("infoBox");
  if (!el) return;

  if (nomGrille === null) {
    el.innerHTML = `
      <div class="legend-title">Maille 10 km</div>
      <div class="muted">Survolez une maille</div>
    `;
    return;
  }

  el.innerHTML = `
    <div class="legend-title">${nomGrille}</div>
    <div class="muted">Code maille : ${codeGrille ?? "—"}</div>
    <div style="margin-top:6px;"><b>Espèce :</b> ${libelleEspece}</div>
    <div style="margin-top:6px;"><b>Année :</b> ${annee}</div>
    <div style="margin-top:6px;"><b>Observations :</b> ${Number(valeur || 0).toLocaleString("fr-FR")}</div>
  `;
}

// ==========================
// LÉGENDE
// ==========================
const controleLegende = L.control({ position: "bottomright" });

controleLegende.onAdd = function () {
  const div = L.DomUtil.create("div", "legend");
  div.innerHTML = `
    <div class="legend-title">Légende</div>
    <div class="legend-row"><b>Couleur</b> = nombre d’observations</div>
    <div id="legendScale" style="margin-top:8px;"></div>
    <div class="muted" style="margin-top:6px;">Intensité sur échelle logarithmique</div>
  `;
  return div;
};

controleLegende.addTo(carte);

function afficherEchelleLegende(valeurMax) {
  const el = document.getElementById("legendScale");
  if (!el) return;

  const ticksT = [0, 0.33, 0.66, 1.0];
  const tickValues = ticksT.map((t) =>
    t === 0 ? 0 : Math.round(Math.expm1(t * Math.log1p(valeurMax)))
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
            ${couleurBleuRouge(0.0)},
            ${couleurBleuRouge(0.5)},
            ${couleurBleuRouge(1.0)}
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
// COULEURS
// ==========================
function couleurBleuRouge(t) {
  const interpolation = (a, b, x) => Math.round(a + (b - a) * x);
  const r = interpolation(43, 230, t);
  const g = interpolation(108, 0, t);
  const b = interpolation(255, 0, t);
  return `rgb(${r},${g},${b})`;
}

function valeurVersRatio(v, vMax) {
  if (!v || v <= 0) return 0;
  const a = Math.log(1 + v);
  const b = Math.log(1 + vMax);
  return b > 0 ? Math.min(1, a / b) : 0;
}

// ==========================
// FONCTIONS UTILITAIRES
// ==========================
function extraireAnnee(feature) {
  const y = feature?.properties?.[CHAMP_ANNEE];
  if (y === undefined || y === null) return null;
  const n = Number(y);
  return Number.isFinite(n) ? n : null;
}

function premiereProprieteExistante(props, champs) {
  if (!props) return null;
  for (const champ of champs) {
    const valeur = props[champ];
    if (valeur !== undefined && valeur !== null && String(valeur).trim() !== "") {
      return valeur;
    }
  }
  return null;
}

function extraireLibelleEspece(feature) {
  const props = feature?.properties || {};

  const nomScientifique = props.species
    ? String(props.species).trim()
    : null;

  const nomVernaculaire = nomScientifique && MAPPING_ESPECES[nomScientifique]
    ? MAPPING_ESPECES[nomScientifique]
    : (props.vernacularName_fr || "Espèce inconnue");

  if (nomScientifique && nomVernaculaire !== nomScientifique) {
    return `${nomVernaculaire} (${nomScientifique})`;
  }

  return nomVernaculaire;
}

function normaliserCodeGrille(valeur) {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  return s || null;
}

function extraireCodeGrilleObs(feature) {
  const brut = premiereProprieteExistante(feature?.properties, CHAMPS_GRILLE_OBS);
  return normaliserCodeGrille(brut);
}

function extraireCodeGrillePolygone(feature) {
  const brut = premiereProprieteExistante(feature?.properties, CHAMPS_CODE_GRILLE);
  return normaliserCodeGrille(brut);
}

function extraireNomGrillePolygone(feature) {
  const brut = premiereProprieteExistante(feature?.properties, CHAMPS_NOM_GRILLE);
  return brut ? String(brut) : "Maille";
}

function libelleEspeceCourante() {
  return selectEspece.value === "__ALL__" ? "Toutes les espèces" : selectEspece.value;
}

function formaterPourcentageSigne(valeur) {
  if (!Number.isFinite(valeur)) return "0 %";
  const arrondi = Math.round(valeur);
  return `${arrondi > 0 ? "+" : ""}${arrondi} %`;
}

function variationPourcentage(valeurAvant, valeurApres) {
  if (!Number.isFinite(valeurAvant) || !Number.isFinite(valeurApres)) return null;
  if (valeurAvant === 0) {
    return valeurApres > 0 ? 100 : 0;
  }
  return ((valeurApres - valeurAvant) / valeurAvant) * 100;
}

function moyenne(tableau) {
  if (!tableau || tableau.length === 0) return null;
  return tableau.reduce((a, b) => a + b, 0) / tableau.length;
}

function serieVersMap(serie) {
  const map = new Map();
  for (let i = 0; i < serie.annees.length; i += 1) {
    map.set(serie.annees[i], serie.valeurs[i]);
  }
  return map;
}

function evenementExactPourAnnee(annee) {
  return EVENEMENTS_EXTERNES.find((event) => event.annee === annee) || null;
}

function evenementPasseLePlusProche(annee) {
  const candidats = EVENEMENTS_EXTERNES.filter((event) => event.annee <= annee);
  if (candidats.length === 0) return null;
  return candidats[candidats.length - 1];
}

function comparaisonAvantApres(serie, anneeEvenement, tailleFenetre = 3) {
  const serieMap = serieVersMap(serie);

  const valeursAvant = [];
  const valeursApres = [];

  for (let y = anneeEvenement - tailleFenetre; y <= anneeEvenement - 1; y += 1) {
    if (serieMap.has(y)) valeursAvant.push(serieMap.get(y));
  }

  for (let y = anneeEvenement; y <= anneeEvenement + tailleFenetre - 1; y += 1) {
    if (serieMap.has(y)) valeursApres.push(serieMap.get(y));
  }

  const moyenneAvant = moyenne(valeursAvant);
  const moyenneApres = moyenne(valeursApres);

  if (moyenneAvant === null || moyenneApres === null) {
    return null;
  }

  return {
    moyenneAvant,
    moyenneApres,
    pct: variationPourcentage(moyenneAvant, moyenneApres),
  };
}

// ==========================
// MASQUE FRANCE
// ==========================
function collecterAnneauxExterieurs(geometry) {
  const anneaux = [];
  if (!geometry) return anneaux;

  if (geometry.type === "Polygon") {
    if (geometry.coordinates?.[0]) anneaux.push(geometry.coordinates[0]);
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates || []) {
      if (poly?.[0]) anneaux.push(poly[0]);
    }
  }
  return anneaux;
}

async function ajouterMasqueFrance() {
  const res = await fetch(URL_FRANCE);
  if (!res.ok) throw new Error(`Échec du chargement de ${URL_FRANCE} : ${res.status}`);
  const france = await res.json();

  if (coucheContour) carte.removeLayer(coucheContour);
  if (coucheMasque) carte.removeLayer(coucheMasque);

  coucheContour = L.geoJSON(france, {
    style: { weight: 2, opacity: 0.85, fillOpacity: 0 },
    interactive: false,
  }).addTo(carte);

  const bounds = coucheContour.getBounds();
  carte.fitBounds(bounds.pad(0.02));
  carte.setMaxBounds(bounds.pad(0.1));
  carte.options.maxBoundsViscosity = 1.0;

  const mondeExterieur = [
    [-90, -180],
    [-90, 180],
    [90, 180],
    [90, -180],
  ];

  const feature = france.type === "FeatureCollection" ? france.features[0] : france;
  const geometry = feature.type === "Feature" ? feature.geometry : feature.geometry;

  const anneaux = collecterAnneauxExterieurs(geometry);
  const trous = anneaux.map((anneau) => anneau.map(([lon, lat]) => [lat, lon]));

  coucheMasque = L.polygon([mondeExterieur, ...trous], {
    stroke: false,
    fillColor: "#ffffff",
    fillOpacity: 0,
    interactive: false,
  }).addTo(carte);

  coucheMasque.bringToFront();
  coucheContour.bringToFront();
}

// ==========================
// INDEX DES ESPÈCES
// ==========================
function construireIndexEspeces(features) {
  indexParEspece = new Map();
  compteParEspece = new Map();

  for (const feature of features) {
    const libelle = extraireLibelleEspece(feature);

    if (!indexParEspece.has(libelle)) {
      indexParEspece.set(libelle, []);
    }

    indexParEspece.get(libelle).push(feature);
    compteParEspece.set(libelle, (compteParEspece.get(libelle) || 0) + 1);
  }

  toutesLesEspeces = Array.from(indexParEspece.keys());
}

function rafraichirSelectEspece() {
  const requete = (rechercheEspece.value || "").trim().toLowerCase();
  const modeTri = selectTri.value || "count";
  const valeurPrecedente = selectEspece.value || "__ALL__";

  let especesFiltrees = toutesLesEspeces.filter((nom) =>
    nom.toLowerCase().includes(requete)
  );

  if (modeTri === "count") {
    especesFiltrees.sort(
      (a, b) => (compteParEspece.get(b) || 0) - (compteParEspece.get(a) || 0)
    );
  } else {
    especesFiltrees.sort((a, b) => a.localeCompare(b, "fr"));
  }

  selectEspece.innerHTML = "";

  const optionToutes = document.createElement("option");
  optionToutes.value = "__ALL__";
  optionToutes.textContent = "Toutes les espèces";
  selectEspece.appendChild(optionToutes);

  for (const nom of especesFiltrees) {
    const option = document.createElement("option");
    option.value = nom;
    option.textContent = `${nom} (${(compteParEspece.get(nom) || 0).toLocaleString("fr-FR")})`;
    selectEspece.appendChild(option);
  }

  const valeursDisponibles = [...selectEspece.options].map((option) => option.value);
  selectEspece.value = valeursDisponibles.includes(valeurPrecedente) ? valeurPrecedente : "__ALL__";
}

// ==========================
// COMPTAGES
// ==========================
function featuresCandidates(especeSelectionnee) {
  if (especeSelectionnee === "__ALL__") return featuresObservations;
  return indexParEspece.get(especeSelectionnee) || [];
}

function construireComptagesGrille(annee, mode, especeSelectionnee) {
  const candidates = featuresCandidates(especeSelectionnee);
  const counts = new Map();
  let total = 0;

  for (const feature of candidates) {
    const y = extraireAnnee(feature);
    if (y === null) continue;

    const correspond = mode === "cumulative" ? y <= annee : y === annee;
    if (!correspond) continue;

    const codeGrille = extraireCodeGrilleObs(feature);
    if (!codeGrille) continue;

    counts.set(codeGrille, (counts.get(codeGrille) || 0) + 1);
    total += 1;
  }

  return { counts, total };
}

function valeurMaxComptage(counts) {
  let vMax = 1;
  for (const valeur of counts.values()) {
    vMax = Math.max(vMax, valeur);
  }
  return vMax;
}

function construireSerieTemporelle(especeSelectionnee) {
  const candidates = featuresCandidates(especeSelectionnee);
  const countsByYear = new Map();

  for (const feature of candidates) {
    const annee = extraireAnnee(feature);
    if (annee === null) continue;
    countsByYear.set(annee, (countsByYear.get(annee) || 0) + 1);
  }

  const anneesTriees = Array.from(countsByYear.keys()).sort((a, b) => a - b);
  const valeurs = anneesTriees.map((annee) => countsByYear.get(annee) || 0);

  return { annees: anneesTriees, valeurs };
}

// ==========================
// RENDU CARTE
// ==========================
function afficherCarte(annee, mode, especeSelectionnee) {
  const { counts, total } = construireComptagesGrille(annee, mode, especeSelectionnee);
  const vMax = valeurMaxComptage(counts);

  afficherEchelleLegende(vMax);

  valeurAnnee.textContent = String(annee);
  valeurTotal.textContent = `Total observations : ${total.toLocaleString("fr-FR")}`;

  if (coucheGrille) {
    carte.removeLayer(coucheGrille);
  }

  coucheGrille = L.geoJSON(geoGrille, {
    style: (feature) => {
      const codeGrille = extraireCodeGrillePolygone(feature);
      const valeur = codeGrille ? counts.get(codeGrille) || 0 : 0;
      const ratio = valeurVersRatio(valeur, vMax);

      return {
        color: "#666",
        weight: 0.3,
        opacity: 0.45,
        fillColor: valeur > 0 ? couleurBleuRouge(ratio) : "#d9d9d9",
        fillOpacity: valeur > 0 ? 0.82 : 0.03,
      };
    },
    onEachFeature: (feature, layer) => {
      const codeGrille = extraireCodeGrillePolygone(feature);
      const nomGrille = extraireNomGrillePolygone(feature);
      const valeur = codeGrille ? counts.get(codeGrille) || 0 : 0;

      layer.on("mouseover", () => {
        layer.setStyle({ weight: 1.1, opacity: 1.0 });
        mettreAJourInfoBox(nomGrille, codeGrille, valeur, libelleEspeceCourante(), annee);
      });

      layer.on("mouseout", () => {
        coucheGrille.resetStyle(layer);
        mettreAJourInfoBox(null, null, null, null, null);
      });
    },
  }).addTo(carte);

  coucheGrille.bringToFront();
  if (coucheContour) coucheContour.bringToFront();
}

// ==========================
// PLUGIN ÉVÉNEMENTS DU GRAPHIQUE
// ==========================
const pluginEvenements = {
  id: "pluginEvenements",
  afterDatasetsDraw(chart, _args, options) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales?.x) return;

    const evenements = options?.events || [];
    const labels = chart.data.labels || [];

    ctx.save();
    ctx.font = "12px system-ui, Arial, sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";

    evenements.forEach((event, index) => {
      const xIndex = labels.findIndex((label) => Number(label) === Number(event.annee));
      if (xIndex === -1) return;

      const x = scales.x.getPixelForValue(xIndex);

      ctx.beginPath();
      ctx.strokeStyle = event.couleur || "#888";
      ctx.lineWidth = event.important ? 1.5 : 1;
      ctx.setLineDash(event.important ? [5, 4] : [3, 4]);
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      if (!event.important) return;

      const yTexte = chartArea.top + 14 + (index % 2) * 22;
      const texte = event.label;

      ctx.fillStyle = event.couleur || "#444";
      ctx.beginPath();
      ctx.arc(x + 2, yTexte, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(x + 10, yTexte + 1);
      ctx.rotate(-0.22);
      ctx.fillStyle = event.couleur || "#444";
      ctx.fillText(texte, 0, 0);
      ctx.restore();
    });

    ctx.restore();
  },
};

Chart.register(pluginEvenements);

// ==========================
// GRAPHIQUE
// ==========================
function afficherGraphique(especeSelectionnee) {
  const serie = construireSerieTemporelle(especeSelectionnee);

  if (graphiqueInstance) {
    graphiqueInstance.destroy();
  }

  graphiqueInstance = new Chart(canvasGraphique, {
    type: "line",
    data: {
      labels: serie.annees,
      datasets: [
        {
          label: libelleEspeceCourante(),
          data: serie.valeurs,
          borderColor: "#2563eb",
          backgroundColor: "rgba(37, 99, 235, 0.16)",
          pointBackgroundColor: "#2563eb",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1,
          borderWidth: 3,
          tension: 0.28,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: {
        duration: 250,
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            boxWidth: 40,
            color: "#222",
            font: {
              size: 14,
              weight: "600",
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(17, 24, 39, 0.92)",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 12,
          displayColors: false,
          callbacks: {
            title(context) {
              return `Année ${context[0].label}`;
            },
            label(context) {
              const valeur = context.parsed.y ?? 0;
              return `Observations : ${valeur.toLocaleString("fr-FR")}`;
            },
          },
        },
        pluginEvenements: {
          events: EVENEMENTS_EXTERNES,
        },
      },
      layout: {
        padding: {
          top: 70,
          right: 18,
          left: 8,
          bottom: 8,
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Année",
            color: "#333",
            font: {
              size: 15,
              weight: "600",
            },
          },
          ticks: {
            color: "#555",
            maxRotation: 45,
            minRotation: 45,
            autoSkip: true,
            maxTicksLimit: 14,
          },
          grid: {
            color: "rgba(0,0,0,0.06)",
          },
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: "Nombre d’observations",
            color: "#333",
            font: {
              size: 15,
              weight: "600",
            },
          },
          ticks: {
            color: "#555",
          },
          grid: {
            color: "rgba(0,0,0,0.07)",
          },
        },
      },
    },
  });
}

// ==========================
// INSIGHTS
// ==========================
function afficherInsights(annee, mode, especeSelectionnee) {
  const serie = construireSerieTemporelle(especeSelectionnee);
  const libelleSelection = especeSelectionnee === "__ALL__" ? "toutes les espèces" : especeSelectionnee;

  if (serie.annees.length === 0) {
    listeInsights.innerHTML = "<li>Aucune donnée disponible pour la sélection actuelle.</li>";
    return;
  }

  const indexCourant = serie.annees.findIndex((y) => y === annee);
  const valeurCourante = indexCourant >= 0 ? serie.valeurs[indexCourant] : 0;

  let valeurPrecedente = null;
  if (indexCourant > 0) {
    valeurPrecedente = serie.valeurs[indexCourant - 1];
  }

  const premiereAnnee = serie.annees[0];
  const premiereValeur = serie.valeurs[0] || 0;

  let texteVariationAnnuelle = "Aucune année précédente disponible pour comparaison.";
  if (valeurPrecedente !== null) {
    const pct = variationPourcentage(valeurPrecedente, valeurCourante);
    texteVariationAnnuelle = `Par rapport à l’année précédente disponible, la variation est de ${formaterPourcentageSigne(pct)}.`;
  }

  let texteLongTerme = "La comparaison de long terme n’est pas disponible.";
  if (premiereAnnee !== annee) {
    const pct = variationPourcentage(premiereValeur, valeurCourante);
    texteLongTerme = `Depuis ${premiereAnnee}, les observations pour ${libelleSelection} ont évolué de ${formaterPourcentageSigne(pct)}.`;
  }

  const texteMode =
    mode === "cumulative"
      ? "La carte affiche les observations cumulées jusqu’à l’année sélectionnée."
      : "La carte affiche uniquement les observations de l’année sélectionnée.";

  const evenementExact = evenementExactPourAnnee(annee);
  const evenementProche = evenementPasseLePlusProche(annee);

  let texteEvenement = "Aucun événement annoté exactement sur cette année.";
  if (evenementExact) {
    texteEvenement = `Événement annoté en ${annee} : ${evenementExact.label} (${evenementExact.categorie}). ${evenementExact.description}`;
  } else if (evenementProche) {
    texteEvenement = `Événement externe annoté le plus proche dans le passé : ${evenementProche.annee} – ${evenementProche.label} (${evenementProche.categorie}).`;
  }

  let texteAvantApres = "Pas assez de données pour comparer avant / après l’événement le plus proche.";
  if (evenementProche) {
    const comparaison = comparaisonAvantApres(serie, evenementProche.annee, 3);
    if (comparaison) {
      texteAvantApres =
        `Autour de ${evenementProche.label}, la moyenne annuelle passe de ` +
        `${Math.round(comparaison.moyenneAvant).toLocaleString("fr-FR")} avant l’événement à ` +
        `${Math.round(comparaison.moyenneApres).toLocaleString("fr-FR")} après ` +
        `(${formaterPourcentageSigne(comparaison.pct)}).`;
    }
  }

  const texteInterpretation =
    "Ces alignements constituent des indices visuels d’un effet possible de facteurs externes, mais ne permettent pas à eux seuls de prouver une causalité.";

  listeInsights.innerHTML = `
    <li><b>${annee}</b> : ${valeurCourante.toLocaleString("fr-FR")} observations pour <b>${libelleSelection}</b>.</li>
    <li>${texteVariationAnnuelle}</li>
    <li>${texteLongTerme}</li>
    <li>${texteEvenement}</li>
    <li>${texteAvantApres}</li>
    <li>${texteMode}</li>
    <li>${texteInterpretation}</li>
  `;
}

function construireGalerieEspeces() {
  if (!galerieEspeces) return;

  galerieEspeces.innerHTML = "";

  ESPECES_UI.forEach((espece) => {
    const carte = document.createElement("div");
    carte.className = "species-thumb";
    carte.dataset.value = espece.value;

    carte.innerHTML = `
      <img src="${espece.image}" alt="${espece.value}">
      <div class="label">${espece.value}</div>
    `;

    carte.addEventListener("click", () => {
      selectEspece.value = espece.value;
      rafraichir();
    });

    galerieEspeces.appendChild(carte);
  });
}

function mettreAJourGalerieActive() {
  if (!galerieEspeces) return;

  const valeurSelectionnee = selectEspece.value || "__ALL__";

  galerieEspeces.querySelectorAll(".species-thumb").forEach((element) => {
    element.classList.toggle("active", element.dataset.value === valeurSelectionnee);
  });
}
// ==========================
// RAFRAÎCHISSEMENT GLOBAL
// ==========================
function rafraichir() {
  const annee = Number(sliderAnnee.value);
  const mode = selectMode.value;
  const especeSelectionnee = selectEspece.value || "__ALL__";

  afficherCarte(annee, mode, especeSelectionnee);
  afficherGraphique(especeSelectionnee);
  afficherInsights(annee, mode, especeSelectionnee);
  mettreAJourGalerieActive();
}

// ==========================
// LECTURE AUTOMATIQUE
// ==========================
function avancerAnnee() {
  const current = Number(sliderAnnee.value);
  const maxYear = Number(sliderAnnee.max);
  const minYear = Number(sliderAnnee.min);

  const nextYear = current >= maxYear ? minYear : current + 1;
  sliderAnnee.value = String(nextYear);
  rafraichir();
}

function definirEtatLecture(active) {
  lectureAutoActive = active;

  if (timerLecture) {
    clearInterval(timerLecture);
    timerLecture = null;
  }

  if (lectureAutoActive) {
    boutonPlay.textContent = "Pause";
    const delai = Number(selectVitesse.value) || 700;
    timerLecture = setInterval(avancerAnnee, delai);
  } else {
    boutonPlay.textContent = "Lecture";
  }
}

function basculerLecture() {
  definirEtatLecture(!lectureAutoActive);
}

// ==========================
// INITIALISATION
// ==========================
async function main() {
  await ajouterMasqueFrance();

  {
    const res = await fetch(URL_GRILLE);
    if (!res.ok) throw new Error(`Échec du chargement de ${URL_GRILLE} : ${res.status}`);
    const geo = await res.json();
    geoGrille = geo.type === "FeatureCollection"
      ? geo
      : { type: "FeatureCollection", features: [] };
  }

  {
    const res = await fetch(URL_OBSERVATIONS);
    if (!res.ok) throw new Error(`Échec du chargement de ${URL_OBSERVATIONS} : ${res.status}`);
    const geo = await res.json();
    featuresObservations = geo.features || [];
  }

  if (featuresObservations.length === 0) {
    throw new Error("Aucune observation trouvée dans le dataset.");
  }

  listeAnnees = featuresObservations
    .map(extraireAnnee)
    .filter((annee) => annee !== null)
    .sort((a, b) => a - b);

  if (listeAnnees.length === 0) {
    throw new Error("Aucune année valide trouvée dans le dataset.");
  }

  construireIndexEspeces(featuresObservations);
  rafraichirSelectEspece();
  construireGalerieEspeces();

  const anneeMin = Math.min(...listeAnnees);
  const anneeMax = Math.max(...listeAnnees);

  sliderAnnee.min = String(anneeMin);
  sliderAnnee.max = String(anneeMax);
  sliderAnnee.value = String(anneeMin);

  valeurAnnee.textContent = String(anneeMin);
  valeurTotal.textContent = "Total observations : —";

  selectEspece.addEventListener("change", () => {
    if (lectureAutoActive) definirEtatLecture(false);
    rafraichir();
  });

  selectMode.addEventListener("change", () => {
    if (lectureAutoActive) definirEtatLecture(false);
    rafraichir();
  });

  selectTri.addEventListener("change", () => {
    rafraichirSelectEspece();
    rafraichir();
  });

  rechercheEspece.addEventListener("input", () => {
    rafraichirSelectEspece();
    rafraichir();
  });

  sliderAnnee.addEventListener("input", () => {
    if (lectureAutoActive) definirEtatLecture(false);
    rafraichir();
  });

  boutonPlay.addEventListener("click", basculerLecture);

  selectVitesse.addEventListener("change", () => {
    if (lectureAutoActive) definirEtatLecture(true);
  });

  rafraichir();
}

main().catch((error) => {
  console.error(error);
  alert(
    `${error.message}\n\nConseils :\n- Lance le projet avec Live Server ou python -m http.server\n- Vérifie les chemins des GeoJSON\n- Vérifie que phasianidae_full_grid.geojson contient bien year, cd_sig et les champs espèce`
  );
});