import { calculateMarketScore } from "../../domain/scoring/MarketScoreEngine.js";
import { SignalColor } from "../../domain/signals/SignalRule.js";
import { getCanonicalIndicatorMetadataV1 } from "../../domain/indicators/canonicalIndicatorMetadata.js";
import { buildQuickInfo } from "./quickInfoFormatter.js";

export const signalPresentation = Object.freeze({
  [SignalColor.GREEN]: Object.freeze({ className: "signal-green", label: "Green" }),
  [SignalColor.YELLOW]: Object.freeze({ className: "signal-yellow", label: "Yellow" }),
  [SignalColor.RED]: Object.freeze({ className: "signal-red", label: "Red" }),
  [SignalColor.UNKNOWN]: Object.freeze({ className: "signal-unknown", label: "Unknown" }),
});

function unknownSignal(reason) {
  return { color: SignalColor.UNKNOWN, status: "UNKNOWN", reason };
}

export function buildDashboardViewModel(grid, evaluationResults, { generatedAt = new Date().toISOString() } = {}) {
  const evaluationsByEntry = new Map(evaluationResults.map((result) => [result.entry, result]));
  const resultsByEntry = new Map(evaluationResults.map((result) => [result.entry, result.signal]));
  const configuredSignals = grid.configuredEntryIds.map((entryId) => ({
    entryId,
    signal: resultsByEntry.get(entryId) ?? unknownSignal("SIGNAL_RESULT_NOT_FOUND"),
  }));
  const marketScore = calculateMarketScore(configuredSignals);
  const cells = grid.slots.map((slot) => {
    if (slot.entryId === null) return { position: slot.position, entryId: null, name: null, color: SignalColor.UNKNOWN, ...signalPresentation.UNKNOWN };
    const metadata = getCanonicalIndicatorMetadataV1(slot.entryId);
    const signal = resultsByEntry.get(slot.entryId) ?? unknownSignal("SIGNAL_RESULT_NOT_FOUND");
    const presentation = signalPresentation[signal.color] ?? signalPresentation.UNKNOWN;
    return {
      position: slot.position,
      entryId: slot.entryId,
      name: metadata?.display.name ?? slot.entryId,
      color: signal.color,
      reason: signal.reason ?? null,
      quickInfo: buildQuickInfo(slot.entryId, signal, {
        observationDate: evaluationsByEntry.get(slot.entryId)?.observationDate,
        source: evaluationsByEntry.get(slot.entryId)?.source,
      }),
      ...presentation,
    };
  });
  return Object.freeze({ cells, marketScore, generatedAt });
}

export function formatMarketScore(score) {
  if (score === null) return "N/A";
  return `${score >= 0 ? "+" : ""}${score.toFixed(2)}`;
}
