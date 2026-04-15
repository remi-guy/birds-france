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
  "Lyrurus tetrix": "#8B3A3A",
  "Lagopus muta": "#2E8B57",
  "Tetrastes bonasia": "#9370DB",
  "Alectoris graeca": "#CD853F"
};

function normalizeSpecies(s) {
  return (s || "").trim().normalize("NFC");
}

window.createProtectedBarplot = function createProtectedBarplot() {

  d3.select("#protected").html("");

  const width = 900;
  const height = 600;
  const margin = { top: 40, right: 40, bottom: 120, left: 80 };

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = d3.select("#protected")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  d3.csv("../data/phasianidae_filtered.csv").then(data => {

    data = data.map(d => ({
      species: normalizeSpecies(d.species),
      in_ep: String(d.in_ep).toLowerCase() === "true"
    }))
    .filter(d => speciesList.includes(d.species));

    // calcul proportions
    const stats = speciesList.map(sp => {
      const spData = data.filter(d => d.species === sp);
      const total = spData.length;
      const protectedCount = spData.filter(d => d.in_ep).length;

      return {
        species: sp,
        proportion: total > 0 ? protectedCount / total : 0,
        total: total
      };
    });

    // tri du + protégé au - protégé
    stats.sort((a, b) => d3.descending(a.proportion, b.proportion));

    const x = d3.scaleBand()
      .domain(stats.map(d => d.species))
      .range([0, innerWidth])
      .padding(0.3);

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([innerHeight, 0]);

    // Axe Y
    g.append("g")
      .call(d3.axisLeft(y).tickFormat(d3.format(".0%")))
      .selectAll("text")
      .style("font-weight", "bold");

    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -innerHeight / 2)
      .attr("y", -55)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Part des observations en zone protégée");

    // Axe X
    g.append("g")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).tickFormat(d => speciesLabels[d]))
      .selectAll("text")
      .attr("transform", "rotate(-20)")
      .style("text-anchor", "end")
      .style("font-weight", "bold");

    // Barres
    g.selectAll("rect")
      .data(stats)
      .enter()
      .append("rect")
      .attr("x", d => x(d.species))
      .attr("y", d => y(d.proportion))
      .attr("width", x.bandwidth())
      .attr("height", d => innerHeight - y(d.proportion))
      .attr("fill", d => speciesColors[d.species])
      .attr("opacity", 0.85);

    // Labels % au-dessus des barres
    g.selectAll(".label")
      .data(stats)
      .enter()
      .append("text")
      .attr("x", d => x(d.species) + x.bandwidth() / 2)
      .attr("y", d => y(d.proportion) - 8)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text(d => d3.format(".0%")(d.proportion));

    // Tooltip
    g.selectAll("rect")
      .append("title")
      .text(d =>
        `${speciesLabels[d.species]}
Observations: ${d.total}
Protégées: ${d3.format(".1%")(d.proportion)}`
      );

  }).catch(error => {
    console.error("Erreur chargement CSV :", error);
  });
}
})();