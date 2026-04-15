
(() => {
const speciesList = [
  "Tetrao urogallus",
  "Lyrurus tetrix",
  "Lagopus muta",
  "Tetrastes bonasia",
  "Alectoris graeca"
];

const speciesLabels = {
  "Tetrao urogallus": "Grand Tétras",
  "Lyrurus tetrix": "Tétras lyre",
  "Lagopus muta": "Lagopède alpin",
  "Tetrastes bonasia": "Gélinotte des bois",
  "Alectoris graeca": "Perdrix bartavelle"
};

const habitatColors = {
  "Prairies": "#F4D35E",
  "Forêt de feuillus": "#4CAF50",
  "Forêt de conifères": "#1B5E20",
  "Landes ligneuses / broussailles": "#81C784",
  "Glaciers / neiges éternelles": "#A6DCEF",
  "Zone urbaine diffuse": "#9E9E9E",
  "Surfaces minérales naturelles": "#C7B299",
  "Autres": "#DDDDDD"
};

function normalizeSpecies(s) {
  return (s || "").trim().normalize("NFC");
}

function normalizeHabitat(h) {
  h = (h || "Inconnu").trim();

  if (h === "Prairies naturelles" || h === "Prairies") {
    return "Prairies";
  }

  return h;
}

function darker(color) {
  return d3.color(color).darker(1.1).formatHex();
}

function createPatternRect(pattern, color, width, height) {
  pattern.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", color);
}


window.createStackedBarplot = function createStackedBarplot() {
  d3.select("#stacked").html("");

  const width = 1200;
  const height = 700;
  const margin = { top: 40, right: 320, bottom: 110, left: 80 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select("#stacked")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const defs = svg.append("defs");

  // Prairies : points
  {
    const p = defs.append("pattern")
      .attr("id", "pat-prairies")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Prairies"], 8, 8);

    p.append("circle")
      .attr("cx", 2).attr("cy", 2).attr("r", 1.2)
      .attr("fill", darker(habitatColors["Prairies"]));

    p.append("circle")
      .attr("cx", 6).attr("cy", 6).attr("r", 1.2)
      .attr("fill", darker(habitatColors["Prairies"]));
  }

  // Forêt de conifères : lignes verticales
  {
    const p = defs.append("pattern")
      .attr("id", "pat-foret-coniferes")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Forêt de conifères"], 8, 8);

    p.append("line")
      .attr("x1", 2).attr("y1", 0)
      .attr("x2", 2).attr("y2", 8)
      .attr("stroke", d => darker(habitatColors["Forêt de conifères"]))
      .attr("stroke-width", 1.2);

    p.append("line")
      .attr("x1", 6).attr("y1", 0)
      .attr("x2", 6).attr("y2", 8)
      .attr("stroke", d => darker(habitatColors["Forêt de conifères"]))
      .attr("stroke-width", 1.2);
  }

  // Surfaces minérales naturelles : lignes horizontales
  {
    const p = defs.append("pattern")
      .attr("id", "pat-surfaces-minerales")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Surfaces minérales naturelles"], 8, 8);

    p.append("line")
      .attr("x1", 0).attr("y1", 2)
      .attr("x2", 8).attr("y2", 2)
      .attr("stroke", d => darker(habitatColors["Surfaces minérales naturelles"]))
      .attr("stroke-width", 1);

    p.append("line")
      .attr("x1", 0).attr("y1", 6)
      .attr("x2", 8).attr("y2", 6)
      .attr("stroke", d => darker(habitatColors["Surfaces minérales naturelles"]))
      .attr("stroke-width", 1);
  }

  // Landes ligneuses / broussailles : points plus espacés
  {
    const p = defs.append("pattern")
      .attr("id", "pat-landes")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Landes ligneuses / broussailles"], 8, 8);

    p.append("circle")
      .attr("cx", 2).attr("cy", 2).attr("r", 1.1)
      .attr("fill", darker(habitatColors["Landes ligneuses / broussailles"]));

    p.append("circle")
      .attr("cx", 6).attr("cy", 6).attr("r", 1.1)
      .attr("fill", darker(habitatColors["Landes ligneuses / broussailles"]));
  }

  // Forêt de feuillus : croisillons
  {
    const p = defs.append("pattern")
      .attr("id", "pat-foret-feuillus")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Forêt de feuillus"], 8, 8);

    p.append("path")
      .attr("d", "M0,0 L8,8 M8,0 L0,8")
      .attr("stroke", d => darker(habitatColors["Forêt de feuillus"]))
      .attr("stroke-width", 1);
  }

  // Zone urbaine diffuse : quadrillage
  {
    const p = defs.append("pattern")
      .attr("id", "pat-urbain")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Zone urbaine diffuse"], 8, 8);

    p.append("path")
      .attr("d", "M4,0 V8 M0,4 H8")
      .attr("stroke", d =>darker(habitatColors["Zone urbaine diffuse"]))
      .attr("stroke-width", 0.9);
  }

  // Glaciers / neiges éternelles : zigzag
  {
    const p = defs.append("pattern")
      .attr("id", "pat-glaciers")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 10)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Glaciers / neiges éternelles"], 10, 8);

    p.append("path")
      .attr("d", "M0,6 L2,2 L4,6 L6,2 L8,6 L10,2")
      .attr("fill", "none")
      .attr("stroke", d =>darker(habitatColors["Glaciers / neiges éternelles"]))
      .attr("stroke-width", 0.9);
  }

  // Autres : fond gris avec petit motif diagonal
  {
    const p = defs.append("pattern")
      .attr("id", "pat-autres")
      .attr("patternUnits", "userSpaceOnUse")
      .attr("width", 8)
      .attr("height", 8);

    createPatternRect(p, habitatColors["Autres"], 8, 8);

    p.append("path")
      .attr("d", "M0,8 l8,-8")
      .attr("stroke", d =>darker(habitatColors["Autres"]))
      .attr("stroke-width", 0.8);
  }

  const habitatPatterns = {
    "Prairies": "url(#pat-prairies)",
    "Forêt de feuillus": "url(#pat-foret-feuillus)",
    "Forêt de conifères": "url(#pat-foret-coniferes)",
    "Landes ligneuses / broussailles": "url(#pat-landes)",
    "Glaciers / neiges éternelles": "url(#pat-glaciers)",
    "Zone urbaine diffuse": "url(#pat-urbain)",
    "Surfaces minérales naturelles": "url(#pat-surfaces-minerales)",
    "Autres": "url(#pat-autres)"
  };

  d3.csv("../data/phasianidae_filtered.csv").then(data => {
    data = data
      .map(d => ({
        species: normalizeSpecies(d.species),
        habitat: normalizeHabitat(d.label_fr)
      }))
      .filter(d =>
        speciesList.includes(d.species) &&
        d.habitat !== ""
      );

    const allowedHabitats = [
      "Prairies",
      "Forêt de conifères",
      "Surfaces minérales naturelles",
      "Landes ligneuses / broussailles",
      "Forêt de feuillus",
      "Zone urbaine diffuse",
      "Glaciers / neiges éternelles"
    ];

    const filtered = data.map(d => ({
      ...d,
      habitat: allowedHabitats.includes(d.habitat) ? d.habitat : "Autres"
    }));

    const habitatKeys = [
      "Prairies",
      "Forêt de conifères",
      "Surfaces minérales naturelles",
      "Landes ligneuses / broussailles",
      "Forêt de feuillus",
      "Zone urbaine diffuse",
      "Glaciers / neiges éternelles",
      "Autres"
    ];

    const table = speciesList.map(sp => {
      const spData = filtered.filter(d => d.species === sp);
      const total = spData.length;
      const row = { species: sp };

      habitatKeys.forEach(h => {
        const n = spData.filter(d => d.habitat === h).length;
        row[h] = total > 0 ? n / total : 0;
      });

      return row;
    });

    const x = d3.scaleBand()
      .domain(speciesList)
      .range([0, innerWidth])
      .padding(0.22);

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    const stack = d3.stack().keys(habitatKeys);
    const series = stack(table);

    g.append("g")
      .call(d3.axisLeft(y).tickFormat(d3.format(".0%")))
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "bold");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -55)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Proportion des observations");

    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => speciesLabels[d] || d))
      .selectAll("text")
      .attr("transform", "rotate(-20)")
      .style("text-anchor", "end")
      .style("font-size", "12px")
      .style("font-weight", "bold");

    g.selectAll(".serie")
      .data(series)
      .enter()
      .append("g")
      .selectAll("rect")
      .data(d => d.map(v => ({ ...v, key: d.key })))
      .enter()
      .append("rect")
      .attr("x", d => x(d.data.species))
      .attr("y", d => y(d[1]))
      .attr("height", d => y(d[0]) - y(d[1]))
      .attr("width", x.bandwidth())
      .attr("fill", d => habitatPatterns[d.key] || habitatColors["Autres"])
      .attr("stroke", d =>darker(habitatColors[d.key] || habitatColors["Autres"]))
      .attr("stroke-width", 0.6)
      .append("title")
      .text(d => `${speciesLabels[d.data.species]} — ${d.key}: ${d3.format(".1%")(d.data[d.key])}`);

    const legend = svg.append("g")
      .attr("transform", `translate(${margin.left + innerWidth + 20},${margin.top})`);


    habitatKeys.forEach((h, i) => {
      const row = legend.append("g")
        .attr("transform", `translate(0,${i * 26})`);

      row.append("rect")
        .attr("width", 16)
        .attr("height", 16)
        .attr("fill", habitatPatterns[h] || habitatColors["Autres"])
        .attr("stroke", d =>darker(habitatColors[h] || habitatColors["Autres"]));

      row.append("text")
        .attr("x", 24)
        .attr("y", 12)
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text(h);
    });
  }).catch(error => {
    console.error("Erreur chargement CSV :", error);
  });
}
})();