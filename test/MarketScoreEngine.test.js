import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateMarketScore,
  classifyMarketRegime,
  MarketRegime,
  MarketScoreEngine,
} from "../src/domain/scoring/MarketScoreEngine.js";

const entry = (entryId, color) => ({ entryId, signal: color === undefined ? null : { color } });

test("all GREEN is +1 BULLISH", () => {
  assert.deepEqual(calculateMarketScore([entry("a", "GREEN"), entry("b", "GREEN")]), {
    configuredCount: 2, validCount: 2, unknownCount: 0, emptyCount: 7,
    rawScore: 2, marketScore: 1, regime: "BULLISH", dataCompleteness: 1, scoreGranularity: 0.5,
  });
});

test("all RED is -1 BEARISH", () => {
  const result = calculateMarketScore([entry("a", "RED"), entry("b", "RED")]);
  assert.equal(result.marketScore, -1);
  assert.equal(result.regime, MarketRegime.BEARISH);
});

test("all YELLOW is zero NEUTRAL", () => {
  const result = calculateMarketScore([entry("a", "YELLOW"), entry("b", "YELLOW")]);
  assert.equal(result.rawScore, 0);
  assert.equal(result.marketScore, 0);
  assert.equal(result.regime, MarketRegime.NEUTRAL);
});

test("mixed valid signals use equal weight", () => {
  const result = calculateMarketScore([
    entry("a", "GREEN"), entry("b", "GREEN"), entry("c", "RED"), entry("d", "YELLOW"),
  ]);
  assert.equal(result.rawScore, 1);
  assert.equal(result.marketScore, 0.25);
  assert.equal(result.regime, "NEUTRAL");
});

test("exact regime thresholds are NEUTRAL", () => {
  assert.equal(classifyMarketRegime(0.30), "NEUTRAL");
  assert.equal(classifyMarketRegime(-0.30), "NEUTRAL");
});

test("values beyond regime thresholds are directional", () => {
  assert.equal(classifyMarketRegime(0.300001), "BULLISH");
  assert.equal(classifyMarketRegime(-0.300001), "BEARISH");
});

test("UNKNOWN is excluded rather than treated as YELLOW", () => {
  const result = calculateMarketScore([
    entry("valid", "GREEN"), entry("unknown", "UNKNOWN"), entry("missing-signal"),
  ]);
  assert.equal(result.rawScore, 1);
  assert.equal(result.marketScore, 1);
  assert.equal(result.validCount, 1);
  assert.equal(result.unknownCount, 2);
  assert.equal(result.dataCompleteness, 1 / 3);
  assert.equal(result.scoreGranularity, 1);
});

test("configured entries with no valid signals produce UNKNOWN", () => {
  const result = calculateMarketScore([entry("a", "UNKNOWN"), entry("b")]);
  assert.equal(result.validCount, 0);
  assert.equal(result.rawScore, 0);
  assert.equal(result.marketScore, null);
  assert.equal(result.regime, "UNKNOWN");
  assert.equal(result.dataCompleteness, 0);
  assert.equal(result.scoreGranularity, null);
});

test("empty grid has null score and completeness", () => {
  assert.deepEqual(calculateMarketScore([]), {
    configuredCount: 0, validCount: 0, unknownCount: 0, emptyCount: 9,
    rawScore: 0, marketScore: null, regime: "UNKNOWN", dataCompleteness: null, scoreGranularity: null,
  });
});

test("partially filled grid preserves counts without a minimum-valid rule", () => {
  const result = calculateMarketScore([entry("a", "RED"), entry("b", "UNKNOWN"), entry("c", "YELLOW")]);
  assert.equal(result.configuredCount, 3);
  assert.equal(result.validCount, 2);
  assert.equal(result.emptyCount, 6);
  assert.equal(result.dataCompleteness, 2 / 3);
  assert.equal(result.marketScore, -0.5);
  assert.equal(result.scoreGranularity, 0.5);
});

test("UNKNOWN does not dilute score or change regime based on completeness", () => {
  const result = calculateMarketScore([
    entry("g1", "GREEN"), entry("g2", "GREEN"), entry("g3", "GREEN"), entry("g4", "GREEN"),
    entry("r1", "RED"),
    entry("u1", "UNKNOWN"), entry("u2", "UNKNOWN"), entry("u3", "UNKNOWN"), entry("u4", "UNKNOWN"),
  ]);
  assert.equal(result.configuredCount, 9);
  assert.equal(result.validCount, 5);
  assert.equal(result.unknownCount, 4);
  assert.equal(result.rawScore, 3);
  assert.equal(result.marketScore, 3 / 5);
  assert.equal(result.regime, "BULLISH");
  assert.equal(result.dataCompleteness, 5 / 9);
  assert.equal(result.scoreGranularity, 1 / 5);
});

test("score granularity follows variable validCount without changing thresholds", () => {
  for (const validCount of [9, 5, 3]) {
    const configured = Array.from({ length: validCount }, (_, index) => entry(`valid-${validCount}-${index}`, "GREEN"));
    const result = calculateMarketScore(configured);
    assert.equal(result.scoreGranularity, 1 / validCount);
    assert.equal(result.marketScore, 1);
    assert.equal(result.regime, "BULLISH");
  }
  assert.equal(classifyMarketRegime(0.30), "NEUTRAL");
  assert.equal(classifyMarketRegime(-0.30), "NEUTRAL");
});

test("exhaustively validates all 3^9 fully-valid grid arrangements and symmetry", () => {
  const colors = ["GREEN", "YELLOW", "RED"];
  const inverse = { GREEN: "RED", YELLOW: "YELLOW", RED: "GREEN" };
  const oppositeRegime = { BULLISH: "BEARISH", NEUTRAL: "NEUTRAL", BEARISH: "BULLISH" };
  const combinationCount = 3 ** 9;

  for (let encoded = 0; encoded < combinationCount; encoded += 1) {
    let remainder = encoded;
    const arrangement = [];
    for (let cell = 0; cell < 9; cell += 1) {
      arrangement.push(colors[remainder % 3]);
      remainder = Math.floor(remainder / 3);
    }

    const greenCount = arrangement.filter((color) => color === "GREEN").length;
    const redCount = arrangement.filter((color) => color === "RED").length;
    const expectedRawScore = greenCount - redCount;
    const expectedRegime = expectedRawScore >= 3
      ? "BULLISH"
      : expectedRawScore <= -3 ? "BEARISH" : "NEUTRAL";
    const result = calculateMarketScore(arrangement.map((color, index) => entry(`cell-${index}`, color)));

    assert.equal(result.rawScore, expectedRawScore);
    assert.equal(result.marketScore, expectedRawScore / 9);
    assert.equal(result.regime, expectedRegime);
    assert.equal(result.scoreGranularity, 1 / 9);

    const mirrored = calculateMarketScore(arrangement.map((color, index) => entry(`mirror-${index}`, inverse[color])));
    const expectedMirroredRawScore = result.rawScore === 0 ? 0 : -result.rawScore;
    assert.equal(mirrored.rawScore, expectedMirroredRawScore);
    const expectedMirroredScore = result.marketScore === 0 ? 0 : -result.marketScore;
    assert.equal(mirrored.marketScore, expectedMirroredScore);
    assert.equal(mirrored.regime, oppositeRegime[result.regime]);
  }
});

test("source-specific siblings are scored independently", () => {
  const result = calculateMarketScore([
    entry("cpi_core_cpi:headline", "RED"),
    entry("cpi_core_cpi:core", "GREEN"),
    entry("permits_starts:permits", "YELLOW"),
    entry("yield_curve_10y3m", "GREEN"),
    entry("yield_curve_10y2y", "RED"),
  ]);
  assert.equal(result.configuredCount, 5);
  assert.equal(result.validCount, 5);
  assert.equal(result.rawScore, 0);
});

test("rejects more than nine configured entries", () => {
  assert.throws(
    () => calculateMarketScore(Array.from({ length: 10 }, (_, index) => entry(`entry-${index}`, "GREEN"))),
    (error) => error.code === "GRID_CAPACITY_EXCEEDED",
  );
});

test("rejects duplicate exact entry identity and unsupported colors", () => {
  assert.throws(
    () => calculateMarketScore([entry("same", "GREEN"), entry("same", "RED")]),
    (error) => error.code === "DUPLICATE_GRID_ENTRY",
  );
  assert.throws(() => calculateMarketScore([entry("a", "BLUE")]));
});

test("engine rejects non-equal weighting", () => {
  assert.throws(() => new MarketScoreEngine({ weightingMode: "CUSTOM" }), (error) => error.code === "UNSUPPORTED_WEIGHTING_MODE");
});

test("engine can override a threshold without restating equal weighting", () => {
  const engine = new MarketScoreEngine({ bullishThreshold: 0.5 });
  assert.equal(engine.evaluate([entry("a", "GREEN"), entry("b", "YELLOW")]).regime, "NEUTRAL");
});
