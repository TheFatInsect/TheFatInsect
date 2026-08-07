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

let payload;
try {
  payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  die(`cannot read ${inputPath}: ${error.message}`);
}

const dailySource = valueAt(payload, ["historyPreview", "daily"]);
if (!Array.isArray(dailySource) || dailySource.length === 0) {
  die("historyPreview.daily must contain at least one entry");
}

const daily = dailySource
  .map((entry) => ({
    date: String(entry.date),
    tokens: readNumber(entry.tokens, `tokens for ${entry.date}`),
  }))
  .sort((left, right) => left.date.localeCompare(right.date));

const summaryTotal = valueAt(payload, ["historyPreview", "summary", "totalTokens"]);
const allTimeTotal = valueAt(payload, ["periods", "allTime", "totalTokens"]);
const totalTokens = readNumber(
  summaryTotal === undefined || summaryTotal === null ? allTimeTotal : summaryTotal,
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

if (topModels.length === 0) die("periods.allTime.models has no usable entries");

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
