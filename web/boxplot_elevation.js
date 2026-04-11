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

const speciesColors = { 
    "Tetrao urogallus": "#6B8E23", 
    "Lyrurus tetrix": "#8B3A3A", // brun rouge 
    "Lagopus muta": "#2E8B57", // vert forêt 
    "Tetrastes bonasia": "#9370DB", // violet doux 
    "Alectoris graeca": "#CD853F" // brun sable 
    };

function normalizeSpecies(s) {
  return (s || "").trim().normalize("NFC");
}

function getSummaryStats(values) {
  const sorted = values.slice().sort(d3.ascending);
  return {
    min: d3.min(sorted),
    q1: d3.quantile(sorted, 0.25),
    median: d3.quantile(sorted, 0.5),
    q3: d3.quantile(sorted, 0.75),
    max: d3.max(sorted)
  };
}

window.createBoxplot = function createBoxplot() {
  d3.select("#boxplot").html("");

  const width = 1300;
  const height = 700;
  const margin = { top: 30, right: 220, bottom: 100, left: 80 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const allColumns = [...speciesList, "ALL"];

  const svg = d3.select("#boxplot")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  d3.csv("../data/processed/phasianidae_filtered.csv").then(function(data) {
    data = data
      .map(d => ({
        species: normalizeSpecies(d.species),
        elevation: +d.elevation
      }))
      .filter(d =>
        speciesList.includes(d.species) &&
        !isNaN(d.elevation) &&
        d.elevation >= 500
      );

    console.log("Nb lignes après filtre :", data.length);

    if (data.length === 0) {
      g.append("text")
        .attr("x", 20)
        .attr("y", 30)
        .text("Aucune donnée à afficher");
      return;
    }

    const x = d3.scaleBand()
      .domain(allColumns)
      .range([0, innerWidth])
      .paddingInner(0.35)
      .paddingOuter(0.2);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d.elevation))
      .nice()
      .range([innerHeight, 0]);

    // Axe Y
    g.append("g")
      .call(d3.axisLeft(y))
      .selectAll("text")
      .style("font-size", "12px")
      .style("font-weight", "bold");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -60)
      .attr("text-anchor", "middle")
      .style("font-size", "15px")
      .style("font-weight", "bold")
      .text("Altitude (m)");

    // Axe X
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => {
        if (d === "ALL") return "Toutes les espèces";
        return speciesLabels[d] || d;
      }))
      .selectAll("text")
      .attr("transform", "rotate(-20)")
      .style("text-anchor", "end")
      .style("font-weight", "bold")
      .style("font-size", "12px");

    const stats = speciesList
      .map(sp => {
        const values = data
          .filter(d => d.species === sp)
          .map(d => d.elevation);

        if (values.length === 0) return null;

        return {
          species: sp,
          ...getSummaryStats(values)
        };
      })
      .filter(d => d !== null);

    const jitterWidthSpecies = 28;
    const jitterWidthAll = 110;
    const boxWidth = 34;
    const capWidth = 18;

    // Colonnes individuelles par espèce
    speciesList.forEach(sp => {
      const groupData = data.filter(d => d.species === sp);
      const cx = x(sp) + x.bandwidth() / 2;

      const col = g.append("g")
        .attr("transform", `translate(${cx},0)`);

      col.selectAll("circle")
        .data(groupData)
        .enter()
        .append("circle")
        .attr("cx", () => (Math.random() - 0.5) * jitterWidthSpecies)
        .attr("cy", d => y(d.elevation))
        .attr("r", 2.8)
        .attr("fill", speciesColors[sp])
        .attr("opacity", 0.28)
        .append("title")
        .text(d => `${speciesLabels[d.species]} — ${d.elevation} m`);

      const s = stats.find(d => d.species === sp);
      if (!s) return;

      const box = g.append("g")
        .attr("transform", `translate(${cx},0)`);

      box.append("line")
        .attr("x1", 0)
        .attr("x2", 0)
        .attr("y1", y(s.min))
        .attr("y2", y(s.max))
        .attr("stroke", "black")
        .attr("stroke-width", 1.5);

      box.append("line")
        .attr("x1", -capWidth / 2)
        .attr("x2", capWidth / 2)
        .attr("y1", y(s.min))
        .attr("y2", y(s.min))
        .attr("stroke", "black")
        .attr("stroke-width", 1.5);

      box.append("line")
        .attr("x1", -capWidth / 2)
        .attr("x2", capWidth / 2)
        .attr("y1", y(s.max))
        .attr("y2", y(s.max))
        .attr("stroke", "black")
        .attr("stroke-width", 1.5);

      box.append("rect")
        .attr("x", -boxWidth / 2)
        .attr("y", y(s.q3))
        .attr("width", boxWidth)
        .attr("height", y(s.q1) - y(s.q3))
        .attr("fill", "none")
        .attr("stroke", "black")
        .attr("stroke-width", 1.5);

      box.append("line")
        .attr("x1", -boxWidth / 2)
        .attr("x2", boxWidth / 2)
        .attr("y1", y(s.median))
        .attr("y2", y(s.median))
        .attr("stroke", "black")
        .attr("stroke-width", 2);
    });

    // Dernière colonne : toutes les espèces
    const allCx = x("ALL") + x.bandwidth() / 2;

    g.append("g")
      .attr("transform", `translate(${allCx},0)`)
      .selectAll("circle")
      .data(data)
      .enter()
      .append("circle")
      .attr("cx", () => (Math.random() - 0.5) * jitterWidthAll)
      .attr("cy", d => y(d.elevation))
      .attr("r", 3)
      .attr("fill", d => speciesColors[d.species])
      .attr("opacity", 0.28)
      .append("title")
      .text(d => `${speciesLabels[d.species]} — ${d.elevation} m`);

    // const allOffsets = {
    //   "Tetrao urogallus": -40,
    //   "Lyrurus tetrix": -20,
    //   "Lagopus muta": 0,
    //   "Tetrastes bonasia": 20,
    //   "Alectoris graeca": 40
    // };

    // const allBoxWidth = 24;
    // const allCapWidth = 14;

    // stats.forEach(s => {
    //   const bx = allCx + allOffsets[s.species];

    //   const box = g.append("g")
    //     .attr("transform", `translate(${bx},0)`);

    //   box.append("line")
    //     .attr("x1", 0)
    //     .attr("x2", 0)
    //     .attr("y1", y(s.min))
    //     .attr("y2", y(s.max))
    //     .attr("stroke", "black")
    //     .attr("stroke-width", 1.5)
    //     .attr("opacity", 0.9);

    //   box.append("line")
    //     .attr("x1", -allCapWidth / 2)
    //     .attr("x2", allCapWidth / 2)
    //     .attr("y1", y(s.min))
    //     .attr("y2", y(s.min))
    //     .attr("stroke", "black")
    //     .attr("stroke-width", 1.5)
    //     .attr("opacity", 0.9);

    //   box.append("line")
    //     .attr("x1", -allCapWidth / 2)
    //     .attr("x2", allCapWidth / 2)
    //     .attr("y1", y(s.max))
    //     .attr("y2", y(s.max))
    //     .attr("stroke", "black")
    //     .attr("stroke-width", 1.5)
    //     .attr("opacity", 0.9);

    //   box.append("rect")
    //     .attr("x", -allBoxWidth / 2)
    //     .attr("y", y(s.q3))
    //     .attr("width", allBoxWidth)
    //     .attr("height", y(s.q1) - y(s.q3))
    //     .attr("fill", "black")
    //     .attr("fill-opacity", 0.05)
    //     .attr("stroke", "black")
    //     .attr("stroke-width", 1.5);

    //   box.append("line")
    //     .attr("x1", -allBoxWidth / 2)
    //     .attr("x2", allBoxWidth / 2)
    //     .attr("y1", y(s.median))
    //     .attr("y2", y(s.median))
    //     .attr("stroke", "black")
    //     .attr("stroke-width", 2)
    //     .attr("opacity", 0.95);
    // });

    // légende
    const legend = svg.append("g")
      .attr("transform", `translate(${width - margin.right + 30},${margin.top + 20})`);

    speciesList.forEach((sp, i) => {
      const row = legend.append("g")
        .attr("transform", `translate(0,${i * 30})`);

      row.append("circle")
        .attr("cx", 0)
        .attr("cy", 0)
        .attr("r", 5)
        .attr("fill", speciesColors[sp]);

      row.append("text")
        .attr("x", 12)
        .attr("y", 4)
        .style("font-size", "13px")
        .style("font-weight", "bold")
        .text(speciesLabels[sp]);
    });
  }).catch(function(error) {
    console.error("Erreur chargement CSV :", error);
  });
}
})();