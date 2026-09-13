import { SignalColor } from "../signals/SignalRule.js";

export const MarketRegime = Object.freeze({
  BULLISH: "BULLISH",
  NEUTRAL: "NEUTRAL",
  BEARISH: "BEARISH",
  UNKNOWN: "UNKNOWN",
});

export const SignalScore = Object.freeze({
  [SignalColor.GREEN]: 1,
  [SignalColor.YELLOW]: 0,
  [SignalColor.RED]: -1,
  [SignalColor.UNKNOWN]: null,
});

export const DEFAULT_MARKET_SCORE_CONFIG = Object.freeze({
  gridSize: 9,
  bullishThreshold: 0.30,
  bearishThreshold: -0.30,
  weightingMode: "EQUAL",
  evidenceBasis: "AUTHOR_DEFINED",
  version: "1.0.0",
});

export class MarketScoreValidationError extends Error {
  constructor(message, code = "MARKET_SCORE_INVALID_INPUT") {
    super(message);
    this.name = "MarketScoreValidationError";
    this.code = code;
  }
}

export function classifyMarketRegime(marketScore, config = DEFAULT_MARKET_SCORE_CONFIG) {
  if (marketScore === null || marketScore === undefined) return MarketRegime.UNKNOWN;
  if (!Number.isFinite(marketScore) || marketScore < -1 || marketScore > 1) {
    throw new MarketScoreValidationError("marketScore must be null or a finite number from -1 to +1.");
  }
  if (marketScore > config.bullishThreshold) return MarketRegime.BULLISH;
  if (marketScore < config.bearishThreshold) return MarketRegime.BEARISH;
  return MarketRegime.NEUTRAL;
}

function validateConfiguredEntries(configuredEntries, config) {
  if (!Array.isArray(configuredEntries)) {
    throw new MarketScoreValidationError("configuredEntries must be an array.");
  }
  if (configuredEntries.length > config.gridSize) {
    throw new MarketScoreValidationError(
      `A maximum of ${config.gridSize} configured entries is allowed.`,
      "GRID_CAPACITY_EXCEEDED",
    );
  }

  const entryIds = new Set();
  for (const entry of configuredEntries) {
    if (typeof entry?.entryId !== "string" || entry.entryId.length === 0) {
      throw new MarketScoreValidationError("Every configured entry requires a non-empty entryId.");
    }
    if (entryIds.has(entry.entryId)) {
      throw new MarketScoreValidationError(`Duplicate configured entry: ${entry.entryId}.`, "DUPLICATE_GRID_ENTRY");
    }
    entryIds.add(entry.entryId);

    const color = entry.signal?.color ?? SignalColor.UNKNOWN;
    if (!Object.hasOwn(SignalScore, color)) {
      throw new MarketScoreValidationError(`Unsupported signal color for ${entry.entryId}: ${color}.`);
    }
  }
}

export function calculateMarketScore(configuredEntries, config = DEFAULT_MARKET_SCORE_CONFIG) {
  validateConfiguredEntries(configuredEntries, config);

  const configuredCount = configuredEntries.length;
  const scores = configuredEntries.map((entry) => SignalScore[entry.signal?.color ?? SignalColor.UNKNOWN]);
  const validScores = scores.filter((score) => score !== null);
  const validCount = validScores.length;
  const unknownCount = configuredCount - validCount;
  const emptyCount = config.gridSize - configuredCount;
  const rawScore = validScores.reduce((sum, score) => sum + score, 0);
  const marketScore = validCount === 0 ? null : rawScore / validCount;

  return Object.freeze({
    configuredCount,
    validCount,
    unknownCount,
    emptyCount,
    rawScore,
    marketScore,
    regime: classifyMarketRegime(marketScore, config),
    dataCompleteness: configuredCount === 0 ? null : validCount / configuredCount,
    scoreGranularity: validCount === 0 ? null : 1 / validCount,
  });
}

export class MarketScoreEngine {
  constructor(config = DEFAULT_MARKET_SCORE_CONFIG) {
    const resolvedConfig = { ...DEFAULT_MARKET_SCORE_CONFIG, ...config };
    if (resolvedConfig.weightingMode !== "EQUAL") {
      throw new MarketScoreValidationError("Step 5 supports EQUAL weighting only.", "UNSUPPORTED_WEIGHTING_MODE");
    }
    this.config = Object.freeze(resolvedConfig);
  }

  evaluate(configuredEntries) {
    return calculateMarketScore(configuredEntries, this.config);
  }
}
