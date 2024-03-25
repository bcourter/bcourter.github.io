import ForceGraph from "./ForceGraph.js";

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
  CAM_MES: setHue(enduserHCL, hueOf("orange")),
  MCAD: setHue(enduserHCL, hueOf("olive")),
  CAE: setHue(enduserHCL, hueOf("teal")),
  CFD: setHue(enduserHCL, hueOf("cyan")),
  EDA: setHue(enduserHCL, hueOf("azure")),
  IM_PM: setHue(enduserHCL, hueOf("violet")),
  AEC: setHue(enduserHCL, hueOf("rose")),

  B_rep: setHue(componentHCL, hueOf("yellow")),
  Implicit: setHue(componentHCL, hueOf("green")),
  Physics: setHue(componentHCL, hueOf("teal")),
};

const qualities = {
  AI_ML: d3.hcl(0, 6, 0),
  Generative: d3.hcl(0, 4, 0),
  PDM_PLM: d3.hcl(0, 0, -4),
  VnV_SCM: d3.hcl(0, 0, -4),
  Hardware: d3.hcl(0, -11, 0),
  Ecosystem_Community: d3.hcl(0, 11, -4),
};

const allcategories = { ...industries, ...qualities };

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
  Object.keys(allcategories).forEach((c) => {
    sum += a[c] * b[c];
  });
  return sum;
}

function getNumber(d, key) {
  if (!d[key]) {
    d[key] = 0;
    return 0;
  }

  let num = Number(d[key]);
  if (isNaN(num)) {
    let brands = d[key].split(",");
    brands.forEach((s) => {
      brandMap[s.trim()] = d;
    });
    num = brandValue * brands.length;
    d[key] = num;
  }

  return num;
}

function processVendor(d) {
  d.id = d.Company;

  if (d.Company == "Siemens PLM") {
    let hi = 0;
  }

  d.magnitude = 0;
  d.color = d3.rgb(0, 0, 0);
  for (const [key, hclValue] of Object.entries(industries)) {
    const num = getNumber(d, key);
    d.magnitude += num;

    let rgb = d3.rgb(hclValue);
    d.color.r += rgb.r * num;
    d.color.g += rgb.g * num;
    d.color.b += rgb.b * num;
  }

  if (d.magnitude != 0) {
    d.color.r /= d.magnitude;
    d.color.g /= d.magnitude;
    d.color.b /= d.magnitude;
  }

  let hcl = d3.hcl(d.color);
  if (!hcl.h || !hcl.c) hcl = enduserHCL;

  let qualitiesSum = 0;
  for (const [key, hclValue] of Object.entries(qualities)) {
    const num = getNumber(d, key);
    d.magnitude += num;
    qualitiesSum += num;

    hcl.c += hclValue.c * num;
    hcl.l += hclValue.l * num;
  }

  d.color = d3.color(hcl);

  const angle = (hcl.h * Math.PI) / 180;
  d.dx = Math.cos(angle);
  d.dy = -Math.sin(angle);
  d.special = Math.min(1, hcl.c / 10);

  d.stageSize = stageToSize[d.Stage];
  if (typeof d.stageSize != "number") d.stageSize = 5;

  d.size = Math.sqrt(2.5 * d.magnitude + d.stageSize);
  return d;
}

function initialize(nodes) {
  nodes = nodes.filter((v) => v.magnitude > 0);
  const links = [];

  //   for (let i = 0; i < nodes.length; i++) {
  //     for (let j = 0; j < i; j++) {
  //       let dot = vendorDot(nodes[i], nodes[j]);
  //       if (dot > 0)
  //         links.push({
  //           source: nodes[i].Company,
  //           target: nodes[j].Company,
  //           value: dot,
  //         });
  //     }
  //   }

  let chart = function () {
    // Specify the dimensions of the chart.
    const width = container.clientWidth;
    const height = container.clientHeight;
    const size = Math.min(width, height);
    const explodeRadius = size * 0.2;
    const lineThickness = 1.5;

    function getRadius(d) {
      return (d.size * size) / 160;
    }

    // Create a simulation with several forces.
    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3.forceLink(links).id((d) => d.id)
      )
      .force("charge", d3.forceManyBody())
      .force(
        "collide",
        d3.forceCollide((d) => getRadius(d) + lineThickness)
      )
      .force(
        "x",
        d3.forceX().x((d) => d.dx * d.special * explodeRadius)
      )
      .force(
        "y",
        d3.forceY().y((d) => d.dy * d.special * explodeRadius)
      );

    // Create the SVG container.
    const svg = d3
      .create("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [-width / 2, -height / 2, width, height])
      .attr("style", "max-width: 100%; height: auto;");

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
      .attr("r", (d) => getRadius(d))
      .attr("fill", (d) => d.color)
      .attr("stroke", (d) => d.color.darker(1));

    node.append("title").text((d) => d.Company);

    // Add a label.
    const text = node
      .append("text")
      .attr("fill-opacity", 0.7)
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .attr("style", "label")
      .attr("clip-path", (d) => `circle(${getRadius(d) - lineThickness})`)
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

    return svg.node();
  };

  container.append(chart());
}

d3.tsv(url, processVendor).then(initialize);
