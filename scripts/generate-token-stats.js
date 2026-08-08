#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const inputPath = process.argv[2] || "token-stats.json";
const outputPath = process.argv[3] || "assets/token-usage.svg";

function die(message) {
  console.error(`token-stats: ${message}`);
  process.exit(1);
}

function readNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) die(`missing or invalid ${label}`);
  return parsed;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shortNumber(value) {
  const units = [
    [1000000000, "B"],
    [1000000, "M"],
    [1000, "K"],
  ];

  for (const [size, suffix] of units) {
    if (value >= size) {
      return `${(value / size).toFixed(1).replace(/\.0$/, "")}${suffix}`;
    }
  }

  return value.toLocaleString("en-US");
}

function valueAt(source, pathParts) {
  return pathParts.reduce((cursor, key) => {
    if (cursor === null || cursor === undefined || typeof cursor !== "object") return undefined;
    return cursor[key];
  }, source);
}

function writePendingCard(reason) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="210" viewBox="0 30 800 210" role="img" aria-labelledby="title desc">
  <title id="title">Token usage</title>
  <desc id="desc">${escapeXml(reason)}</desc>
  <style>
    text { font-family: "Ubuntu", "Helvetica", "Arial", sans-serif; }
    .title { fill: #00000f; font-size: 13px; font-weight: 500; }
    .muted { fill: gray; font-size: 11px; }
    .bar { fill: #47a042; fill-opacity: 0.62; }
    .bar-strong { fill: #1d6a23; fill-opacity: 0.9; }
    .track { fill: #efefef; }
  </style>
  <rect width="800" height="240" fill="#ffffff"/>
  <text x="400" y="46" text-anchor="middle" class="title">${escapeXml(reason)}</text>
  <rect x="34" y="170" width="10" height="34" rx="5" class="bar"/>
  <rect x="54" y="138" width="10" height="66" rx="5" class="bar"/>
  <rect x="74" y="156" width="10" height="48" rx="5" class="bar"/>
  <rect x="94" y="104" width="10" height="100" rx="5" class="bar-strong"/>
  <rect x="114" y="146" width="10" height="58" rx="5" class="bar"/>
  <rect x="134" y="122" width="10" height="82" rx="5" class="bar"/>
  <rect x="154" y="181" width="10" height="23" rx="5" class="bar"/>
  <rect x="174" y="132" width="10" height="72" rx="5" class="bar"/>
  <rect x="194" y="165" width="10" height="39" rx="5" class="bar"/>
  <rect x="214" y="150" width="10" height="54" rx="5" class="bar"/>
  <rect x="234" y="117" width="10" height="87" rx="5" class="bar"/>
  <rect x="254" y="174" width="10" height="30" rx="5" class="bar"/>
  <rect x="274" y="142" width="10" height="62" rx="5" class="bar"/>
  <rect x="294" y="158" width="10" height="46" rx="5" class="bar"/>
  <rect x="314" y="129" width="10" height="75" rx="5" class="bar"/>
  <rect x="334" y="184" width="10" height="20" rx="5" class="bar"/>
  <rect x="354" y="145" width="10" height="59" rx="5" class="bar"/>
  <rect x="374" y="166" width="10" height="38" rx="5" class="bar"/>
  <rect x="394" y="112" width="10" height="92" rx="5" class="bar"/>
  <rect x="414" y="154" width="10" height="50" rx="5" class="bar"/>
  <rect x="434" y="136" width="10" height="68" rx="5" class="bar"/>
  <rect x="454" y="178" width="10" height="26" rx="5" class="bar"/>
  <rect x="474" y="126" width="10" height="78" rx="5" class="bar"/>
  <rect x="530" y="82" width="242" height="7" rx="3.5" class="track"/>
  <rect x="530" y="82" width="214" height="7" rx="3.5" class="bar-strong"/>
  <rect x="530" y="111" width="242" height="7" rx="3.5" class="track"/>
  <rect x="530" y="111" width="148" height="7" rx="3.5" class="bar"/>
  <rect x="530" y="140" width="242" height="7" rx="3.5" class="track"/>
  <rect x="530" y="140" width="96" height="7" rx="3.5" class="bar"/>
  <rect x="530" y="169" width="242" height="7" rx="3.5" class="track"/>
  <rect x="530" y="169" width="64" height="7" rx="3.5" class="bar"/>
  <rect x="530" y="198" width="242" height="7" rx="3.5" class="track"/>
  <rect x="530" y="198" width="42" height="7" rx="3.5" class="bar"/>
  <text x="258" y="226" text-anchor="middle" class="muted">Daily usage - connect Token Monitor</text>
  <text x="651" y="226" text-anchor="middle" class="muted">Top models - waiting for data</text>
</svg>
`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, svg);
  console.log(`Generated pending card at ${outputPath}`);
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  die(`cannot read ${inputPath}: ${error.message}`);
}

if (payload && payload.error) {
  die(`stats endpoint returned error: ${payload.error}`);
}

const dailySource = valueAt(payload, ["historyPreview", "daily"]);
if (!Array.isArray(dailySource) || dailySource.length === 0) {
  writePendingCard("Waiting for Token Monitor data");
  process.exit(0);
}

const daily = dailySource
  .map((entry) => ({
    date: String(entry.date),
    tokens: readNumber(entry.tokens, `tokens for ${entry.date}`),
  }))
  .sort((left, right) => left.date.localeCompare(right.date));

const todayKey = valueAt(payload, ["devices", 0, "periodWindows", "today", "key"]);
const todayTokens = Number(valueAt(payload, ["periods", "today", "totalTokens"]));
if (todayKey && Number.isFinite(todayTokens) && todayTokens > 0) {
  const todayEntry = daily.find((entry) => entry.date === todayKey);
  if (todayEntry) {
    todayEntry.tokens = Math.max(todayEntry.tokens, todayTokens);
  } else {
    daily.push({ date: String(todayKey), tokens: todayTokens });
  }
  daily.sort((left, right) => left.date.localeCompare(right.date));
  if (daily.length > 30) daily.splice(0, daily.length - 30);
}

const summaryTotal = valueAt(payload, ["historyPreview", "summary", "totalTokens"]);
const allTimeTotal = valueAt(payload, ["periods", "allTime", "totalTokens"]);
const totalTokens = readNumber(
  allTimeTotal === undefined || allTimeTotal === null ? summaryTotal : allTimeTotal,
  "all-time token total",
);

const updatedAt = new Date(payload.updatedAt);
if (Number.isNaN(updatedAt.valueOf())) die("missing or invalid updatedAt");

const updatedLabel = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "long",
  day: "2-digit",
  timeZone: "UTC",
}).format(updatedAt);

const modelSource = valueAt(payload, ["periods", "allTime", "models"]);
if (!modelSource || typeof modelSource !== "object") {
  die("periods.allTime.models must be an object");
}

const topModels = Object.entries(modelSource)
  .filter(([model, tokens]) => model !== "unknown" && Number(tokens) > 0)
  .map(([model, tokens]) => ({
    model,
    tokens: readNumber(tokens, `tokens for model ${model}`),
  }))
  .sort((left, right) => right.tokens - left.tokens)
  .slice(0, 5);

if (topModels.length === 0) {
  writePendingCard("Waiting for model usage data");
  process.exit(0);
}

const chartLeft = 28;
const chartWidth = 460;
const chartTop = 82;
const chartBottom = 204;
const chartHeight = chartBottom - chartTop;
const maxDailyTokens = Math.max(...daily.map((entry) => entry.tokens), 1);
const daySlot = chartWidth / daily.length;
const barWidth = Math.min(10, daySlot * 0.64);

const peakDay = daily.reduce((peak, entry) => (entry.tokens > peak.tokens ? entry : peak), daily[0]);
const peakIndex = daily.indexOf(peakDay);
const peakX = chartLeft + peakIndex * daySlot + daySlot / 2;

const bars = daily
  .map((entry, index) => {
    const height = Math.max(2, (entry.tokens / maxDailyTokens) * chartHeight);
    const x = chartLeft + index * daySlot + (daySlot - barWidth) / 2;
    const y = chartBottom - height;
    const className = entry.tokens === maxDailyTokens ? "daily-bar peak" : "daily-bar";
    const title = `${entry.date}: ${entry.tokens.toLocaleString("en-US")} tokens`;

    return `  <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="${(barWidth / 2).toFixed(1)}" class="${className}"><title>${escapeXml(title)}</title></rect>`;
  })
  .join("\n");

const modelLeft = 530;
const modelWidth = 242;
const maxModelTokens = topModels[0].tokens;
const modelRows = topModels
  .map((entry, index) => {
    const labelY = 75 + index * 29;
    const trackY = labelY + 6;
    const width = Math.max(4, (entry.tokens / maxModelTokens) * modelWidth);
    const title = `${entry.model}: ${entry.tokens.toLocaleString("en-US")} tokens`;

    return `  <text x="${modelLeft}" y="${labelY}" class="model-name">${escapeXml(entry.model)}</text>
  <text x="${modelLeft + modelWidth}" y="${labelY}" text-anchor="end" class="model-value">${escapeXml(shortNumber(entry.tokens))}</text>
  <rect x="${modelLeft}" y="${trackY}" width="${modelWidth}" height="7" rx="3.5" class="model-track"/>
  <rect x="${modelLeft}" y="${trackY}" width="${width.toFixed(1)}" height="7" rx="3.5" class="model-bar"><title>${escapeXml(title)}</title></rect>`;
  })
  .join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="210" viewBox="0 30 800 210" role="img" aria-labelledby="title desc">
  <title id="title">Token usage</title>
  <desc id="desc">Daily token usage for the most recent ${daily.length} active days and the five most-used models of all time, with ${escapeXml(totalTokens.toLocaleString("en-US"))} tokens used as of ${escapeXml(updatedLabel)}.</desc>
  <style>
    text { font-family: "Ubuntu", "Helvetica", "Arial", sans-serif; }
    .total { fill: #00000f; font-size: 13px; font-weight: 500; }
    .section { fill: gray; font-size: 11px; font-weight: 400; }
    .daily-bar { fill: #47a042; fill-opacity: 0.62; }
    .daily-bar.peak { fill: #1d6a23; fill-opacity: 0.9; }
    .peak-value { fill: #1d6a23; font-size: 10px; font-weight: 500; font-variant-numeric: tabular-nums; }
    .model-name { fill: #00000f; font-size: 10.5px; font-weight: 500; }
    .model-value { fill: gray; font-size: 10px; font-variant-numeric: tabular-nums; }
    .model-track { fill: #efefef; }
    .model-bar { fill: #47a042; }
  </style>
  <rect width="800" height="240" fill="#ffffff"/>
  <text x="400" y="46" text-anchor="middle" class="total">All-time token usage: ${escapeXml(totalTokens.toLocaleString("en-US"))} as of ${escapeXml(updatedLabel)}</text>
${bars}
  <text x="${peakX.toFixed(1)}" y="${chartTop - 7}" text-anchor="middle" class="peak-value">${escapeXml(peakDay.tokens.toLocaleString("en-US"))}</text>
${modelRows}
  <text x="258" y="226" text-anchor="middle" class="section">Daily usage - last ${daily.length} active days</text>
  <text x="651" y="226" text-anchor="middle" class="section">Top models - all time</text>
</svg>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, svg);
console.log(`Generated ${outputPath}`);
