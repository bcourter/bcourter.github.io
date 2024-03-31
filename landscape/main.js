import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqpp3EgZEXoDrQ8MVxr7AS2ifn3Efvlk7QFEEe9Z1iMtOXX7QX5ZK5XQg0EcrSun1umA0-nCr5BQFR/pub?gid=595724753&single=true&output=tsv";

let enduserHCL = d3.hcl(0, 22, 88);
let componentHCL = d3.hcl(0, 33, 66);

const hues = [
  "red",
  "orange",
  "yellow",
  "olive",
  "green",
  "teal",
  "cyan",
  "azure",
  "blue",
  "violet",
  "magenta",
  "rose",
];

function hueOf(name) {
  return hues.indexOf(name) * 30;
}

function setHue(hcl, hue) {
  let op = hcl.copy();
  op.h = hue;
  return op;
}

const industries = {
  CAM_MES: {
    title: "CAM_MES",
    description:
      "Computer-Aided Manufacturing\nManufacturing Execution Systems",
    color: setHue(enduserHCL, hueOf("red")),
    isComponent: false,
  },
  MCAD: {
    title: "MCAD",
    description: "Mechancial Computer-Aided Design",
    color: setHue(enduserHCL, hueOf("yellow")),
    isComponent: false,
  },
  CAE: {
    title: "CAE",
    description: "Computer-Aided Engineering",
    color: setHue(enduserHCL, hueOf("green")),
    isComponent: false,
  },
  CFD: {
    title: "CFD",
    description: "Computational Fluid Dynamics",
    color: setHue(enduserHCL, hueOf("cyan")),
    isComponent: false,
  },
  EDA: {
    title: "EDA",
    description: "Electronic Design Automation",
    color: setHue(enduserHCL, hueOf("blue")),
    isComponent: false,
  },
  IM_PM: {
    title: "IM_PM",
    description: "Industrial Manufacturing\nProcess Manufacturing",
    color: setHue(enduserHCL, hueOf("violet")),
    isComponent: false,
  },
  AEC: {
    title: "AEC",
    description: "Architectural Engineering and Construction",
    color: setHue(enduserHCL, hueOf("magenta")),
    isComponent: false,
  },

  B_rep: {
    title: "B-rep",
    description: "Boundary-Represenation solid models including meshes",
    color: setHue(componentHCL, hueOf("yellow")),
    isComponent: true,
  },
  Implicit: {
    title: "Implicit",
    description: "Implicit solid models described by function of space",
    color: setHue(componentHCL, hueOf("green")),
    isComponent: true,
  },
  Physics: {
    title: "Physics",
    description: "Physical simulation codes",
    color: setHue(componentHCL, hueOf("teal")),
    isComponent: true,
  },
};

class ScoreValue {
  constructor(moat, dank) {
    this.moat = moat;
    this.dank = dank;
  }
}

const allcategoryScores = {
  CAM_MES: new ScoreValue(0, 0),
  MCAD: new ScoreValue(0, 0),
  CAE: new ScoreValue(0, 0),
  CFD: new ScoreValue(0, 0),
  EDA: new ScoreValue(0, 0),
  IM_PM: new ScoreValue(0, 0),
  AEC: new ScoreValue(0, 0),

  B_rep: new ScoreValue(1, 1),
  Implicit: new ScoreValue(1, 1),
  Physics: new ScoreValue(1, 1),

  AI_ML: new ScoreValue(0, 3),
  Generative: new ScoreValue(0, 2),
  PDM_PLM: new ScoreValue(1, 0),
  VnV_SCM: new ScoreValue(1, 0),
  Hardware: new ScoreValue(-1, -1),
  Ecosystem_Community: new ScoreValue(1, 0),

  Components: new ScoreValue(-1, 0),
  Integrations: new ScoreValue(0, 0),
};

const stageToSize = {
  "Tightly Held": 5,
  "Pre-seed": 5,
  Seed: 10,
  "Series A": 15,
  "Series B": 20,
  "Series C": 25,
  "Series D+": 30,
  "Public / PE": 40,
  "Open Source": 10,
};

let brandValue = 2.0;
const brandMap = new Object();

function vendorDot(a, b) {
  let sum = 0;
  Object.keys(allcategoryScores).forEach((c) => {
    sum += a[c] * b[c];
  });
  return sum;
}

function getNumber(d, key, brandList, isBrand) {
  if (!d[key]) {
    d[key] = 0;
    return 0;
  }

  let num = Number(d[key]);
  if (isNaN(num)) {
    let brands = d[key].split(",");
    brands.forEach((s) => {
      let trimmed = s.trim();
      brandList.push(trimmed);
      if (isBrand) brandMap[trimmed] = d;
    });
    num = brandValue * brands.length;
    d[key] = num;
  }

  return num;
}

function processVendor(d) {
  d.id = d.Company;
  brandMap[d.id] = d;

  d.industryScore = 0;
  d.color = d3.rgb(0, 0, 0);
  d.brandList = [];
  for (const [key, hclValue] of Object.entries(industries)) {
    const num = getNumber(d, key, d.brandList, true);
    d.industryScore += num;

    let rgb = d3.rgb(hclValue.color);
    d.color.r += rgb.r * num;
    d.color.g += rgb.g * num;
    d.color.b += rgb.b * num;
  }

  if (d.industryScore != 0) {
    d.color.r /= d.industryScore;
    d.color.g /= d.industryScore;
    d.color.b /= d.industryScore;
  } else {
    let c = enduserHCL.copy();
    c.c = 0;
    d.color = d3.rgb(c);
  }

  let hcl = d3.hcl(d.color);
  if (!hcl.h || !hcl.c) hcl = enduserHCL;

  d.componentsList = [];
  d.integrationsList = [];
  d.qualityScore = 0;
  d.tallyScore = new ScoreValue(0, 0);
  for (const [key, score] of Object.entries(allcategoryScores)) {
    let num;
    if (key == "Components") num = getNumber(d, key, d.componentsList, false);
    else if (key == "Integrations")
      num = getNumber(d, key, d.integrationsList, false);
    else {
      num = getNumber(d, key, d.brandList, true);
      d.qualityScore += num;
    }
    d.tallyScore.moat += score.moat * num;
    d.tallyScore.dank += score.dank * num;
  }

  hcl.l -= d.tallyScore.dank;
  d.color = d3.color(hcl);

  d.hue = ((hcl.h ? hcl.h : 0) * Math.PI) / 180;
  d.dx = Math.cos(d.hue);
  d.dy = -Math.sin(d.hue);
  d.special = Math.min(1, hcl.c / 10);

  d.stageSize = stageToSize[d.Stage];
  if (typeof d.stageSize != "number") d.stageSize = 5;

  d.size = Math.sqrt(2.5 * d.industryScore + d.qualityScore + d.stageSize);

  return d;
}

const svg = d3
  .create("svg")
  .attr("xmlns", "http://www.w3.org/2000/svg")
  .attr("style", "max-width: 100%; height: auto;");

const props = { nodeScale: 1 };

function initialize(nodes) {
  // Specify the dimensions of the chart.
  const width = container.clientWidth;
  const height = container.clientHeight;
  const size = Math.min(width, height);
  const explodeRadius = size * 0.15;
  const lineThickness = 1.0;
  const circleScale = 1 / 250;

  // time legend in back

  const years = Array.from({ length: 32 }, (v, k) => 2024 - 2 * k);

  function yearToX(year) {
    return (width / (2 * 2.5)) * -Math.log((2025 - (year > 0 ? year : 0)) / 8);
  }

  const timeLegend = svg
    .selectAll("years")
    .data(years)
    .enter()
    .append("g")
    .attr("opacity", 0);

  timeLegend
    .append("line")
    .attr("stroke", "#CCC")
    .attr("x1", (d) => yearToX(d))
    .attr("x2", (d) => yearToX(d))
    .attr("y1", height / 2 - 50)
    .attr("y2", -height / 2 + 20);

  timeLegend
    .filter((d) => d >= 2012 || d % 8 == 0)
    .append("text")
    .attr("fill-opacity", 0.7)
    .attr("fill", "#000")
    .attr("text-anchor", "middle")
    .attr("alignment-baseline", "middle")
    .attr("style", "label")
    .attr("x", (d) => yearToX(d))
    .attr("y", height / 2 - 20)
    .text((d) => d);

  function getInsideRadius(d) {
    return d.size * size * circleScale * props.nodeScale;
  }
  function getOutsideRadius(d) {
    return getInsideRadius(d) + Math.max(d.tallyScore.moat, lineThickness);
  }

  nodes = nodes.filter((v) => v.Company.length > 0);

  const links = [];

  function createLink(source, targetName, strength, width) {
    let target = brandMap[targetName];
    if (!target || target === source) {
      console.log(
        `Link creation: could not look up brand: ${targetName} in ${source.Company}.`
      );
      return;
    }
    links.push({
      source: source.id,
      target: target.id,
      distance: getOutsideRadius(target) + getOutsideRadius(target),
      strength: strength,
      value: width,
    });
  }

  nodes.forEach((n) => {
    n.componentsList.forEach((d) => createLink(n, d, 0.1, 3));
    n.integrationsList.forEach((d) => createLink(n, d, 0.01, 1));
  });

  let chart = function () {
    // Create a simulation with several forces.
    let posStrength = 0.15; // default is 0.1

    const simulation = d3
      .forceSimulation(nodes)
      // .force("center", d3.forceCenter(0, 0))
      // .force(
      //   "link",
      //   d3.forceLink(links).id((d) => d.id)
      // )
      .force("charge", d3.forceManyBody().strength(-40))
      .force(
        "collide",
        d3.forceCollide((d) => getOutsideRadius(d) + lineThickness)
      );

    // Create the SVG container.
    resize(); // sets size of svg

    // Add a line for each link, and a circle for each node.
    const link = svg
      .append("g")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => Math.sqrt(d.value));

    const node = svg
      .append("g")
      .attr("stroke-width", lineThickness)
      .selectAll("circle")
      .data(nodes)
      .join("g");

    node
      .append("circle")
      .attr("r", (d) => getOutsideRadius(d))
      .attr("fill", (d) => d.color.darker(1));

    node
      .append("circle")
      .attr("r", (d) => getInsideRadius(d))
      .attr("fill", (d) => d.color);

    node
      .append("title")
      .text(
        (d) =>
          `${d.Company}\n${d.Headquarters}\n${d.Founded}\n` +
          `Brands: ${d.brandList.join(
            " "
          )}\nDependencies: ${d.componentsList.join(" ")}`
      );

    // Add a label.
    const text = node
      .append("text")
      .attr("fill-opacity", 0.7)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .attr("style", "label")
      //   .attr("clip-path", (d) => `circle(${getInsideRadius(d) - lineThickness})`)
      .attr(
        "transform",
        (d) =>
          `scale(${0.22 * Math.min(getInsideRadius(d) / d.Company.length, 5)})` // fudge scaling based on word length
      )
      .text((d) => d.Company);

    // Add a drag behavior.
    node.call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    );

    // Set the position attributes of links and nodes each time the simulation ticks.
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      //   node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Reheat the simulation when drag starts, and fix the subject position.
    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    // Update the subject (dragged node) position during drag.
    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    // Restore the target alpha so the simulation cools after dragging ends.
    // Unfix the subject position now that it’s no longer being dragged.
    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    // When this cell is re-run, stop the previous simulation. (This doesn’t
    // really matter since the target alpha is zero and the simulation will
    // stop naturally, but it’s a good practice.)
    // invalidation.then(() => simulation.stop());

    const filterSize = 100;
    const blurFilter = svg
      .append("defs")
      .append("filter")
      .attr("id", "blurFilter")
      .attr("x", -filterSize)
      .attr("y", -filterSize)
      .attr("width", filterSize * 2)
      .attr("height", filterSize * 2);
    blurFilter.append("feGaussianBlur").attr("stdDeviation", "5");
    blurFilter
      .append("feBlend")
      .attr("in", "SourceGraphic")
      .attr("in2", "blurOut");

    //
    // Legends
    //

    // Hexagon Symbol https://gist.github.com/captainhead/b542212d5f11e50f2ccaa47a71deb6c7
    const a = Math.pow(3, 0.25);
    // Given an area, compute the side length of a hexagon with that area.
    function sideLength(area) {
      return a * Math.sqrt(2 * (area / 9));
    }

    // Generate the 6 vertices of a unit hexagon.
    const basePoints = d3
      .range(6)
      .map((p) => (Math.PI / 3) * p)
      .map((p) => ({
        x: Math.cos(p),
        y: Math.sin(p),
      }));

    const hexagonSymbol = {
      draw: function (context, size) {
        // Scale the unit hexagon's vertices by the desired size of the hexagon.
        const len = sideLength(size);
        const points = basePoints.map(({ x, y }) => ({
          x: x * len,
          y: y * len,
        }));

        // Move to the first vertex of the hexagon.
        let { x, y } = points[0];
        context.moveTo(x, y);
        // Line-to the remaining vertices of the hexagon.
        for (let p = 1; p < points.length; p++) {
          let { x, y } = points[p];
          context.lineTo(x, y);
        }
        // Close the path to connect the last vertex back to the first.
        context.closePath();
      },
    };

    const industryHues = Object.values(industries).filter(
      (i) => !i.isComponent
    );

    const hueLegend = svg
      .selectAll("hues")
      .data(industryHues)
      .enter()
      .append("g");

    // hueLegend
    //   .append("circle")
    //   .attr("r", legendSize)
    //   .attr("fill", (d) => d.color.darker(1));
    const hueHexagon = d3.symbol().size(1800).type(hexagonSymbol);

    hueLegend
      .append("path")
      .attr("d", hueHexagon)
      .attr("fill", (d) => d.color.darker(1))
      .attr("filter", "url(#blurFilter)");

    // hueLegend
    //   .append("foreignObject")
    //   .attr("x", -legendSize)
    //   .attr("y", -legendSize)
    //   .attr("width", 2 * legendSize)
    //   .attr("height", 2 * legendSize)
    //   .append("div")
    //   .attr("xmlns", "http://www.w3.org/1999/xhtml")
    //   .attr("class", "svg-div")
    //   // .attr("width", 2 * legendSize)
    //   // .attr("height", 2 * legendSize)
    //   .html(
    //     "test"
    //   );

    let hueLegendText = hueLegend
      .append("text")
      .attr("fill-opacity", 0.7)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .attr("alignment-baseline", "middle")
      .attr("style", "label");
    // .text((d) => d.title);

    hueLegendText
      .selectAll()
      .data((d) => d.title.split("_"))
      .join("tspan")
      .attr("x", 0)
      .attr("y", (d, i, nodes) => `${i - nodes.length / 2 + 0.8}em`)
      .text((d) => d);

    hueLegend.append("title").text((d) => `${d.description}`);

    const animationDuraction = 800;

    function layoutHorseshoe() {
      simulation
        .force(
          "x",
          d3
            .forceX()
            .x((d) => d.dx * d.special * explodeRadius)
            .strength(posStrength)
        )
        .force(
          "y",
          d3
            .forceY()
            .y((d) => d.dy * d.special * explodeRadius)
            .strength(posStrength)
        );
      simulation.alpha(1).restart();

      hueLegend
        .transition()
        .ease(d3.easeQuadOut)
        .duration(animationDuraction)
        .attr("transform", (d) => {
          let h = (d.color.h * Math.PI) / 180;
          return `translate(${Math.cos(h) * width * 0.45},${
            -Math.sin(h) * height * 0.45
          })`;
        });

      timeLegend
        .transition()
        .duration(animationDuraction / 2)
        .attr("opacity", 0);
    }

    function layoutWorld() {
      simulation
        .force(
          "x",
          d3
            .forceX()
            .x((d) => (d.Longitude * width) / 400) // 400 is padding on 360 deg longitude
            .strength(posStrength)
        )
        .force(
          "y",
          d3
            .forceY()
            .y((d) => -((d.Latitude / 180 - 0.2) * height))
            .strength(posStrength)
        );
      simulation.alpha(1).restart();

      hueLegend
        .transition()
        .ease(d3.easeQuadOut)
        .duration(animationDuraction)
        .attr("transform", (d) => {
          return `translate(${-width * 0.6},${0})`;
        });

      timeLegend
        .transition()
        .duration(animationDuraction / 2)
        .attr("opacity", 0);
    }

    function layoutTimeline() {
      simulation
        .force(
          "x",
          d3
            .forceX()
            .x((d) => yearToX(d.Founded))
            .strength(posStrength)
        )
        .force(
          "y",
          d3
            .forceY()
            .y((d) => ((((d.hue / Math.PI + 0.25) % 2) - 1) * height) / 3)
            .strength(posStrength)
        );
      simulation.alpha(1).restart();

      hueLegend
        .transition()
        .ease(d3.easeQuadOut)
        .duration(animationDuraction)
        .attr("transform", (d) => {
          return `translate(${-width / 2 + 60},${
            ((((d.color.h / 180 + 0.25) % 2) - 1) * height) / 3
          })`;
        });

      timeLegend
        .transition()
        .duration(animationDuraction / 2)
        .attr("opacity", 1);
    }

    function createRadioButtons() {
      let buttons = {
        Industry: layoutHorseshoe,
        Geography: layoutWorld,
        Timeline: layoutTimeline,
      };

      let first = true;
      for (const [name, action] of Object.entries(buttons)) {
        var radioButton = document.createElement("input");
        radioButton.type = "radio";
        radioButton.name = "layout";
        radioButton.value = name;

        if (first) {
          first = false;
          radioButton.checked = true;
        }

        radioButton.addEventListener("change", action);
        overlay.appendChild(radioButton);

        // Create label for the radio button
        var label = document.createElement("label");
        label.appendChild(document.createTextNode(name));
        overlay.appendChild(label);

        // Line break for readability
        overlay.appendChild(document.createElement("br"));
      }
    }

    createRadioButtons(simulation);

    layoutHorseshoe();
    return svg.node();
  };

  container.append(chart());
}

// https://gist.github.com/curran/3a68b0c81991e2e94b19
function resize() {
  // Extract the width and height that was computed by CSS.
  var width = container.clientWidth;
  var height = container.clientHeight;

  // Use the extracted size to set the size of an SVG element.
  if (!svg) return;

  svg
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-width / 2, -height / 2, width, height]);
}

// Redraw based on the new size whenever the browser window is resized.
window.addEventListener("resize", resize);

d3.tsv(url, processVendor).then(initialize);
