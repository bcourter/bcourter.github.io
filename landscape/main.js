import ForceGraph from "./ForceGraph.js";

const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqpp3EgZEXoDrQ8MVxr7AS2ifn3Efvlk7QFEEe9Z1iMtOXX7QX5ZK5XQg0EcrSun1umA0-nCr5BQFR/pub?gid=595724753&single=true&output=tsv";

let enduserColor = d3.hcl(0, 22, 88);
let componentColor = d3.hcl(0, 22, 66);

const hues = [
  "red",
  "orange",
  "yellow",
  "olive",
  "green",
  "teal",
  "blue",
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

const components = {
  AI_ML: d3.hcl(0, 44, 88),
  Generative: d3.hcl(0, 33, 88),
  MCAD: setHue(enduserColor, hueOf("yellow")),
  CAE: setHue(enduserColor, hueOf("blue")),
  CFD: setHue(enduserColor, hueOf("violet")),
  CAM_MES: setHue(enduserColor, hueOf("red")),
  EDA: setHue(enduserColor, hueOf("green")),
  AEC: setHue(enduserColor, hueOf("rose")),
  IM_PM: setHue(enduserColor, hueOf("olive")),
  PDM_PLM: d3.hcl(0, 0, 66),
  VnV_SCM: setHue(enduserColor, hueOf("orange")),
  Hardware: d3.hcl(0, 0, 88),
  Ecosystem_Community: d3.hcl(0, 0, 66),
  B_rep: setHue(componentColor, hueOf("yellow")),
  Implicit: setHue(componentColor, hueOf("cyan")),
  Physics: setHue(componentColor, hueOf("blue")),
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
  Object.keys(components).forEach((c) => {
    sum += a[c] * b[c];
  });
  return sum;
}

function processVendor(d) {
  d.id = d.Company;
  d.magnitude = 0;
  d.color = d3.rgb(0, 0, 0);
  let colorAverageCount = 0;
  for (const [key, hcl] of Object.entries(components)) {
    if (!d[key]) {
      d[key] = 0;
      continue;
    }

    let num = Number(d[key]);
    if (isNaN(num)) {
      let brands = d[key].split(",");
      brands.forEach((s) => {
        brandMap[s.trim()] = d;
      });
      num = brandValue * brands.length;
    }

    d.magnitude += num;

    let rgb = d3.rgb(hcl);
    d.color.r += rgb.r;
    d.color.g += rgb.g;
    d.color.b += rgb.b;
    colorAverageCount++;
  }

  if (colorAverageCount != 0) {
    d.color.r /= colorAverageCount;
    d.color.g /= colorAverageCount;
    d.color.b /= colorAverageCount;
  }

  d.stageSize = stageToSize[d.Stage];
  if (typeof d.stageSize != "number") d.stageSize = 5;

  d.size = d.magnitude + d.stageSize;
  return d;
}

function initialize(data) {
  //   let chart = BubbleChart(data, {
  //     label: (d) => d.Company.split(" ").join("\n"),
  //     value: (d) => d.size,
  //     // group: (d) => d.id.split(".")[1],
  //     title: (d) => d.Company,
  //     link: (d) => d.url,
  //     width: 1452,
  //   });

  data = data.filter((v) => v.magnitude > 0);
  const links = [];

  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < i; j++) {
      let dot = vendorDot(data[i], data[j]);
      if (dot > 0)
        links.push({
          source: data[i].Company,
          target: data[j].Company,
          value: dot,
        });
    }
  }

  let chart = ForceGraph(
    { nodes: data, links: links },
    {
      nodeID: (d) => d.Company,
      nodeTitle: (d) => d.Company,
      nodeRadius: (d) => d.size,
      nodeFill: (d) => (d ? d.color.formatHex() : "#fff"),
      //   link: (d) => d.url,
      linkStrength: 0.01,
      width: 1452,
      height: 1024,
    }
  );

  container.append(chart);
}

d3.tsv(url, processVendor).then(initialize);
