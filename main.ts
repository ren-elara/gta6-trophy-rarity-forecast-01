const fs = require("node:fs");
const path = require("node:path");

const inputDir = process.env.MAKEFUN_INPUT_DIR || "/input";
const outputDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const normalQuantiles = [-1.6449, -0.6745, 0, 0.6745, 1.6449];
const expectedLevels = [0.05, 0.25, 0.5, 0.75, 0.95];

function clamp(value, low, high) {
  return Math.min(high, Math.max(low, value));
}

function toLogit(percent) {
  const probability = clamp(percent, 0.01, 99.99) / 100;
  return Math.log(probability / (1 - probability));
}

function fromLogit(value) {
  return 100 / (1 + Math.exp(-clamp(value, -30, 30)));
}

function rounded(value) {
  return Number(value.toFixed(4));
}

function linearSlope(points) {
  if (points.length < 3) return 0;

  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  let numerator = 0;
  let denominator = 0;

  for (const point of points) {
    numerator += (point.x - meanX) * (point.y - meanY);
    denominator += (point.x - meanX) ** 2;
  }

  return denominator > 1e-9 ? numerator / denominator : 0;
}

function distinctSnapshots(history) {
  const result = [];
  let previous = "";

  for (const read of history) {
    const signature = JSON.stringify([read.players_tracked, read.rates]);
    if (signature === previous) continue;
    previous = signature;
    result.push({
      time: Date.parse(read.at),
      players: read.players_tracked,
      rates: read.rates,
    });
  }

  return result.filter((snapshot) => Number.isFinite(snapshot.time));
}

function fitPopulationGrowth(snapshots, lastPlayers) {
  const populationPoints = snapshots
    .filter((snapshot) => snapshot.players > 0)
    .map((snapshot) => ({ x: snapshot.time / 86400000, y: Math.log(snapshot.players) }));

  if (populationPoints.length < 2) return 0.22;

  const slope = linearSlope(populationPoints);
  return clamp(slope, 0.02, 0.48) * (lastPlayers > 50000 ? 0.45 : 0.62);
}

function trophyHistory(snapshots, index) {
  const points = snapshots
    .filter((snapshot) => Number.isFinite(snapshot.rates[index]) && snapshot.rates[index] >= 0)
    .map((snapshot) => ({
      time: snapshot.time,
      x: snapshot.time / 86400000,
      rate: snapshot.rates[index],
      y: toLogit(snapshot.rates[index]),
    }));

  if (points.length === 0) {
    return { points, lastRate: 0.01, lastChange: null };
  }

  return {
    points,
    lastRate: points.at(-1).rate,
    lastChange: points.at(-1).time,
  };
}

function forecastTrophy(caseData, trophy, index, snapshots, growthPerDay) {
  const history = trophyHistory(snapshots, index);
  const lastRate = Number.isFinite(history.lastRate) ? history.lastRate : 0.01;
  const horizonDays = Math.max(0, caseData.horizon_minutes / 1440);
  const latestRead = Date.parse(caseData.history.at(-1)?.at ?? caseData.at);
  const staleDays = history.lastChange === null
    ? 0
    : Math.max(0, (latestRead - history.lastChange) / 86400000);
  const futureGrowth = clamp(Math.exp(growthPerDay * horizonDays), 1, 12);

  const slope = clamp(linearSlope(history.points), -0.18, 0.18);
  const evidenceWeight = history.points.length < 4
    ? 0
    : Math.min(0.65, (history.points.length - 3) / 10);
  const trend = slope * horizonDays * evidenceWeight;
  const tierDilution = { bronze: 0.12, silver: 0.08, gold: 0.04, platinum: 0.015 }[trophy.tier] ?? 0.08;
  const priorShift = -tierDilution * Math.log(futureGrowth);
  const medianLogit = toLogit(lastRate) + trend + priorShift;

  const refreshRisk = 1 - Math.exp(-staleDays / 0.12);
  const residuals = history.points.map((point) => Math.abs(point.y - (toLogit(lastRate) + slope * (point.x - history.points.at(-1).x))));
  const residualScale = residuals.length > 2
    ? Math.min(0.3, residuals.reduce((sum, value) => sum + value, 0) / residuals.length * 0.3)
    : 0;
  const spread = 0.34 + 0.24 * Math.sqrt(horizonDays) + 0.46 * refreshRisk + residualScale;
  const downside = 0.32 * refreshRisk;

  return normalQuantiles.map((z) => {
    const tailScale = z < 0 ? 1 + downside : 1 - downside * 0.35;
    return rounded(fromLogit(medianLogit + z * spread * tailScale));
  });
}

function forecastCase(caseData) {
  if (!Array.isArray(caseData.trophies) || !Array.isArray(caseData.history)) {
    throw new Error("case is missing trophies or history");
  }
  if (!Array.isArray(caseData.levels)
    || caseData.levels.length !== expectedLevels.length
    || caseData.levels.some((level, index) => level !== expectedLevels[index])) {
    throw new Error("case uses unsupported quantile levels");
  }
  if (caseData.history.length === 0) throw new Error("case has no history");

  const snapshots = distinctSnapshots(caseData.history);
  const latest = caseData.history.at(-1);
  const growthPerDay = fitPopulationGrowth(snapshots, latest?.players_tracked ?? 0);

  return {
    trophies: caseData.trophies.map((trophy, index) => ({
      id: trophy.id,
      q: forecastTrophy(caseData, trophy, index, snapshots, growthPerDay),
    })),
  };
}

fs.mkdirSync(outputDir, { recursive: true });
const cases = fs.readdirSync(inputDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith(".in"))
  .map((entry) => entry.name)
  .sort();

for (const file of cases) {
  const caseData = JSON.parse(fs.readFileSync(path.join(inputDir, file), "utf8"));
  if (!/^[A-Za-z0-9_-]+$/.test(caseData.id)) throw new Error("invalid case id");
  const result = forecastCase(caseData);
  fs.writeFileSync(path.join(outputDir, `${caseData.id}.out`), `${JSON.stringify(result)}\n`);
}
