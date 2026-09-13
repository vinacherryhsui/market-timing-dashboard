import test from "node:test";
import assert from "node:assert/strict";
import { ResearchFileAdapter } from "../src/data/research/ResearchFileAdapter.js";
import { HistoryCache } from "../src/data/acquisition/HistoryCache.js";
import { indicatorSources } from "../src/data/acquisition/indicatorSources.js";
import { createDemoGridConfiguration, GridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { HistoryPreparationService } from "../src/domain/history/HistoryPreparationService.js";
import { calculateMarketScore } from "../src/domain/scoring/MarketScoreEngine.js";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import { SignalEvaluationService } from "../src/domain/signals/SignalEvaluationService.js";
import { getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const transformationsByEntry = new Map(activeTransformationRegistry.map((entry) => [entry.id, entry]));

function createCachedEvaluationService() {
  const research = new ResearchFileAdapter();
  const cacheOnly = { getHistory: async () => { throw new Error("Unexpected cache miss in integration fixture."); } };
  const historyPreparation = new HistoryPreparationService({
    adapters: {
      FRED: cacheOnly,
      DGBAS: cacheOnly,
      CALDARA_IACOVIELLO: research,
      POLICY_UNCERTAINTY: research,
      NY_FED: research,
    },
    sourceConfigs: indicatorSources,
    historyCache: new HistoryCache(),
    maxCacheAgeMs: Number.POSITIVE_INFINITY,
  });
  return new SignalEvaluationService({
    historyPreparation,
    signalEngine: new SignalEngine({ now: () => new Date("2026-09-08T00:00:00Z") }),
    resolveRule: getSignalRule,
  });
}

async function evaluateGrid(grid, evaluationService) {
  const evaluated = await Promise.all(grid.configuredEntryIds.map(async (entryId) => {
    const transformationEntry = transformationsByEntry.get(entryId);
    assert.ok(transformationEntry, `Transformation must resolve directly for ${entryId}`);
    assert.ok(getSignalRule(entryId), `SignalRule must resolve directly for ${entryId}`);
    const result = await evaluationService.evaluate(transformationEntry);
    return [entryId, result.signal];
  }));
  const signalsByEntry = new Map(evaluated);
  return {
    signalsByEntry,
    score: calculateMarketScore(grid.configuredEntryIds.map((entryId) => ({ entryId, signal: signalsByEntry.get(entryId) }))),
  };
}

test("default Grid -> evaluation -> Signals -> Market Score contract is direct and stable", async () => {
  const evaluationService = createCachedEvaluationService();
  const grid = createDemoGridConfiguration();

  assert.equal(grid.configuredEntryIds.length, 9);
  grid.configuredEntryIds.forEach((entryId) => {
    assert.ok(transformationsByEntry.has(entryId));
    assert.ok(getSignalRule(entryId));
  });

  const original = await evaluateGrid(grid, evaluationService);
  assert.equal(original.signalsByEntry.size, 9);
  assert.equal(original.score.configuredCount, 9);
  assert.equal(original.score.validCount, 9);
  assert.equal(original.score.unknownCount, 0);

  const reversed = new GridConfiguration();
  [...grid.configuredEntryIds].reverse().forEach((entryId) => reversed.addIndicator(entryId));
  const reorderedScore = calculateMarketScore(reversed.configuredEntryIds.map((entryId) => ({
    entryId,
    signal: original.signalsByEntry.get(entryId),
  })));
  assert.equal(reorderedScore.rawScore, original.score.rawScore);
  assert.equal(reorderedScore.marketScore, original.score.marketScore);
  assert.equal(reorderedScore.regime, original.score.regime);

  const unknownEntry = grid.configuredEntryIds[0];
  const scoreWithUnknown = calculateMarketScore(grid.configuredEntryIds.map((entryId) => ({
    entryId,
    signal: entryId === unknownEntry ? { ...original.signalsByEntry.get(entryId), color: "UNKNOWN" } : original.signalsByEntry.get(entryId),
  })));
  assert.deepEqual(grid.configuredEntryIds, createDemoGridConfiguration().configuredEntryIds);
  assert.equal(scoreWithUnknown.configuredCount, 9);
  assert.equal(scoreWithUnknown.validCount, 8);
  assert.equal(scoreWithUnknown.unknownCount, 1);
  assert.equal(scoreWithUnknown.dataCompleteness, 8 / 9);

  const restored = GridConfiguration.fromJSON(JSON.parse(JSON.stringify(grid.toJSON())));
  const restoredResult = await evaluateGrid(restored, evaluationService);
  assert.deepEqual(restored.configuredEntryIds, grid.configuredEntryIds);
  assert.deepEqual(restoredResult.score, original.score);
});

test("source-specific entries and both yield curves retain identity end-to-end", async () => {
  const evaluationService = createCachedEvaluationService();
  const ids = [
    "cpi_core_cpi:headline",
    "cpi_core_cpi:core",
    "permits_starts:permits",
    "yield_curve_10y3m",
    "yield_curve_10y2y",
  ];
  const grid = new GridConfiguration();
  ids.forEach((entryId) => grid.addIndicator(entryId));
  const result = await evaluateGrid(grid, evaluationService);

  assert.deepEqual(grid.configuredEntryIds, ids);
  assert.deepEqual([...result.signalsByEntry.keys()], ids);
  assert.equal(result.score.configuredCount, ids.length);
  assert.equal(result.score.validCount, ids.length);
  for (const entryId of ids) assert.notEqual(result.signalsByEntry.get(entryId).color, "UNKNOWN", entryId);
});
