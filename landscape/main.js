import BubbleChart from "./BubbleChart.js";

const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vQqpp3EgZEXoDrQ8MVxr7AS2ifn3Efvlk7QFEEe9Z1iMtOXX7QX5ZK5XQg0EcrSun1umA0-nCr5BQFR/pub?gid=595724753&single=true&output=tsv";

const components = [
  "AI_ML",
  "Generative",
  "MCAD",
  "CAE",
  "CFD",
  "CAM_MES",
  "EDA",
  "AEC",
  "IM_PM",
  "PDM_PLM",
  "VnV_SCM",
  "Hardware",
  "Ecosystem_Community",
  "B_rep",
  "Implicit",
  "Physics",
];

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

function VendorDot(a, b) {
  let sum = 0;
  components.forEach((c) => {
    sum += a[c] * b[c];
  });
  return sum;
}

function ProcessVendor(d) {
  d.magnitude = 0;
  components.forEach((c) => {
    if (!d[c]) {
      d[c] = 0;
      return;
    }

    let num = Number(d[c]);
    if (isNaN(num)) {
      let brands = d[c].split(",");
      brands.forEach((s) => {
        brandMap[s.trim()] = d;
      });
      num = brandValue * brands.length;
    }

    d.magnitude += num;
  });

  d.stageSize = stageToSize[d.Stage];
  if (typeof d.stageSize != "number") d.stageSize = 5;

  d.size = d.magnitude + d.stageSize;
  return d;
}

function Initialize(data) {
  let chart = BubbleChart(data, {
    label: (d) => d.Company.split(" ").join("\n"),
    value: (d) => d.size,
    // group: (d) => d.id.split(".")[1],
    title: (d) => d.Company,
    link: (d) => d.url,
    width: 1452,
  });

  container.append(chart);
}

d3.tsv(url, ProcessVendor).then(Initialize);
