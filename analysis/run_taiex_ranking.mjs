import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalIndicatorMetadataV1 } from "../src/domain/indicators/canonicalIndicatorMetadata.js";

const dataPath = resolve(import.meta.dirname, "data", "transformed_histories.json");
const outputDir = resolve(import.meta.dirname, "output");
const CORRELATION_LIMIT = 0.8;

function transpose(a) { return a[0].map((_, j) => a.map((row) => row[j])); }
function multiply(a, b) { const bt = transpose(b); return a.map((row) => bt.map((column) => row.reduce((sum, value, i) => sum + value * column[i], 0))); }
function inverse(matrix) {
  const n = matrix.length; const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => Number(i === j))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col; for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    if (Math.abs(a[pivot][col]) < 1e-12) throw new Error("Regression matrix is singular; multicollinearity prevents estimation.");
    [a[col], a[pivot]] = [a[pivot], a[col]]; const divisor = a[col][col]; a[col] = a[col].map((value) => value / divisor);
    for (let row = 0; row < n; row += 1) if (row !== col) { const factor = a[row][col]; a[row] = a[row].map((value, j) => value - factor * a[col][j]); }
  }
  return a.map((row) => row.slice(n));
}
function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
function erf(x) { const sign = x < 0 ? -1 : 1; const z = Math.abs(x); const t = 1 / (1 + 0.3275911 * z); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return sign * y; }
function normalP(t) { return 2 * (1 - 0.5 * (1 + erf(Math.abs(t) / Math.SQRT2))); }
function csvCell(value) { const s = value == null ? "" : String(value); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
async function writeCsv(path, rows) { const columns = Object.keys(rows[0] ?? {}); await writeFile(path, `${columns.join(",")}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\n")}\n`); }

async function taiexReturns() {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/%5ETWII?period1=0&period2=4102444800&interval=1d&events=history&includeAdjustedClose=true";
  const response = await fetch(url, { headers: { "User-Agent": "market-timing-dashboard-research/1.0" } });
  if (!response.ok) throw new Error(`Yahoo Finance request failed with HTTP ${response.status}.`);
  const payload = await response.json(); const result = payload.chart?.result?.[0]; if (!result) throw new Error(`Yahoo Finance returned no ^TWII history: ${JSON.stringify(payload.chart?.error)}`);
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose; const close = result.indicators?.quote?.[0]?.close; const prices = adjusted?.some(Number.isFinite) ? adjusted : close;
  const monthEnd = new Map();
  result.timestamp.forEach((timestamp, i) => { if (Number.isFinite(prices?.[i])) { const date = new Date(timestamp * 1000).toISOString().slice(0, 10); const month = date.slice(0, 7); const previous = monthEnd.get(month); if (!previous || date > previous.date) monthEnd.set(month, { date, price: prices[i] }); } });
  const sorted = [...monthEnd].sort(([a], [b]) => a.localeCompare(b)); const returns = new Map();
  for (let i = 1; i < sorted.length; i += 1) returns.set(sorted[i][0], 100 * (sorted[i][1].price / sorted[i - 1][1].price - 1));
  return { returns, priceField: prices === adjusted ? "adjusted close" : "close", priceStart: sorted[0][1].date, priceEnd: sorted.at(-1)[1].date };
}

function historiesToMaps(histories) { return Object.fromEntries(Object.entries(histories).map(([id, history]) => [id, new Map(history.points.filter((point) => Number.isFinite(point.value)).map((point) => [point.observationDate.slice(0, 7), point.value]))])); }
function joinedRows(seriesMaps, returns, ids) {
  const months = [...seriesMaps[ids[0]].keys()].filter((month) => returns.has(month) && ids.every((id) => seriesMaps[id].has(month))).sort();
  return months.map((month) => ({ month, y: returns.get(month), x: ids.map((id) => seriesMaps[id].get(month)) }));
}
function displayName(id) { return canonicalIndicatorMetadataV1[id]?.display?.name ?? id; }

function fit(label, rows, ids) {
  const n = rows.length; const p = ids.length; if (n <= p + 1) throw new Error(`${label} has only ${n} observations for ${p} regressors.`);
  const means = ids.map((_, j) => rows.reduce((sum, row) => sum + row.x[j], 0) / n);
  const sd = ids.map((_, j) => Math.sqrt(rows.reduce((sum, row) => sum + (row.x[j] - means[j]) ** 2, 0) / n));
  if (sd.some((value) => !Number.isFinite(value) || value === 0)) throw new Error(`${label} contains a zero-variance indicator.`);
  const z = rows.map((row) => row.x.map((value, j) => (value - means[j]) / sd[j])); const x = z.map((row) => [1, ...row]); const y = rows.map((row) => row.y);
  const xt = transpose(x); const invXtx = inverse(multiply(xt, x)); const beta = multiply(multiply(invXtx, xt), y.map((value) => [value])).map(([value]) => value);
  const residuals = y.map((value, i) => value - dot(x[i], beta)); const k = p + 1; const maxlags = Math.max(1, Math.floor(4 * (n / 100) ** (2 / 9)));
  const scores = x.map((row, i) => row.map((value) => value * residuals[i])); let meat = Array.from({ length: k }, () => Array(k).fill(0));
  const addOuter = (left, right, weight) => { for (let i = 0; i < k; i += 1) for (let j = 0; j < k; j += 1) meat[i][j] += weight * left[i] * right[j]; };
  for (const score of scores) addOuter(score, score, 1);
  for (let lag = 1; lag <= maxlags; lag += 1) { const weight = 1 - lag / (maxlags + 1); for (let t = lag; t < n; t += 1) { addOuter(scores[t], scores[t - lag], weight); addOuter(scores[t - lag], scores[t], weight); } }
  meat = meat.map((row) => row.map((value) => value * n / (n - k))); const covariance = multiply(multiply(invXtx, meat), invXtx); const se = covariance.map((row, i) => Math.sqrt(Math.max(0, row[i])));
  const yMean = y.reduce((a, b) => a + b, 0) / n; const sse = residuals.reduce((sum, value) => sum + value ** 2, 0); const sst = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0); const r2 = 1 - sse / sst; const adjustedR2 = 1 - (1 - r2) * (n - 1) / (n - k);
  const corrMatrix = ids.map((_, i) => ids.map((__, j) => z.reduce((sum, row) => sum + row[i] * row[j], 0) / n)); const invCorr = inverse(corrMatrix);
  const highCorrelations = []; for (let i = 0; i < p; i += 1) for (let j = i + 1; j < p; j += 1) if (Math.abs(corrMatrix[i][j]) >= CORRELATION_LIMIT) highCorrelations.push({ indicatorA: ids[i], indicatorB: ids[j], correlation: corrMatrix[i][j] });
  const ranking = ids.map((id, j) => ({ indicator: id, indicatorName: displayName(id), coefficient: beta[j + 1], absoluteCoefficient: Math.abs(beta[j + 1]), sign: beta[j + 1] >= 0 ? "POSITIVE" : "NEGATIVE", hacStandardError: se[j + 1], tStatistic: beta[j + 1] / se[j + 1], pValue: normalP(beta[j + 1] / se[j + 1]), vif: invCorr[j][j] })).sort((a, b) => b.absoluteCoefficient - a.absoluteCoefficient).map((row, index) => ({ rank: index + 1, ...row }));
  return { label, sampleStart: rows[0].month, sampleEnd: rows.at(-1).month, n, maxlags, rSquared: r2, adjustedRSquared: adjustedR2, ranking, highCorrelations };
}

const histories = JSON.parse(await readFile(dataPath, "utf8")); const ids = Object.keys(histories); if (ids.length !== 21) throw new Error(`Expected 21 research histories, found ${ids.length}.`);
const seriesMaps = historiesToMaps(histories); const taiex = await taiexReturns(); const fullRows = joinedRows(seriesMaps, taiex.returns, ids);
const candidates = ids.map((excluded) => ({ excluded, rows: joinedRows(seriesMaps, taiex.returns, ids.filter((id) => id !== excluded)) })).sort((a, b) => b.rows.length - a.rows.length);
const sensitivity = candidates.find((candidate) => candidate.rows.length - fullRows.length >= 12) ?? candidates[0];
const modelA = fit("Model A", fullRows, ids); const modelBIds = ids.filter((id) => id !== sensitivity.excluded); const modelB = fit("Model B", sensitivity.rows, modelBIds);
const byA = new Map(modelA.ranking.map((row) => [row.indicator, row])); const byB = new Map(modelB.ranking.map((row) => [row.indicator, row]));
const comparison = ids.map((id) => ({ indicator: id, indicatorName: displayName(id), modelARank: byA.get(id)?.rank ?? null, modelBRank: byB.get(id)?.rank ?? null, modelASign: byA.get(id)?.sign ?? null, modelBSign: byB.get(id)?.sign ?? null, top9InBoth: Boolean(byA.get(id)?.rank <= 9 && byB.get(id)?.rank <= 9), excludedFromModelB: id === sensitivity.excluded }));
await mkdir(outputDir, { recursive: true }); await writeCsv(resolve(outputDir, "taiex_indicator_ranking_model_a.csv"), modelA.ranking); await writeCsv(resolve(outputDir, "taiex_indicator_ranking_model_b.csv"), modelB.ranking); await writeCsv(resolve(outputDir, "taiex_indicator_ranking_comparison.csv"), comparison); await writeCsv(resolve(outputDir, "taiex_high_correlations_model_a.csv"), modelA.highCorrelations); await writeCsv(resolve(outputDir, "taiex_high_correlations_model_b.csv"), modelB.highCorrelations);
const summary = { generatedAt: new Date().toISOString(), taiex: { ticker: "^TWII", provider: "Yahoo Finance", priceField: taiex.priceField, priceHistory: `${taiex.priceStart} to ${taiex.priceEnd}`, returnDefinition: "100 * (month-end price / prior month-end price - 1)" }, modelA, modelB: { ...modelB, excludedIndicators: [sensitivity.excluded], exclusionReason: `Removing ${sensitivity.excluded} increases the complete-case sample by ${modelB.n - modelA.n} months; it is the minimum one-indicator exclusion producing at least 12 additional observations.` }, comparison };
await writeFile(resolve(outputDir, "taiex_ranking_summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
for (const model of [modelA, modelB]) { console.log(`\n${model.label}: ${model.sampleStart} to ${model.sampleEnd}, N=${model.n}, R2=${model.rSquared.toFixed(4)}, adj.R2=${model.adjustedRSquared.toFixed(4)}, HAC lags=${model.maxlags}`); console.table(model.ranking); console.log(`High-correlation pairs: ${model.highCorrelations.length}`); }
console.log(`\nModel B excludes: ${sensitivity.excluded} (+${modelB.n - modelA.n} observations).`);
