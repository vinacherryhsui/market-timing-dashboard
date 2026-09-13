import assert from "node:assert/strict";
import test from "node:test";
import { getIndicatorSourceConfigs } from "../src/data/acquisition/indicatorSources.js";
import { HistoryPreparationService } from "../src/domain/history/HistoryPreparationService.js";
import { SignalEngine } from "../src/domain/signals/SignalEngine.js";
import { SignalEvaluationService } from "../src/domain/signals/SignalEvaluationService.js";
import { getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const entry = activeTransformationRegistry.find((item) => item.id === "taiwan_cpi");
const sourceConfig = getIndicatorSourceConfigs("taiwan_cpi")[0];

function cpiObservation(observationDate, value) {
  return {
    provider: "DGBAS",
    datasetId: sourceConfig.datasetId,
    indicatorId: "taiwan_cpi",
    observationDate,
    value,
    unit: "Index 2021=100",
    frequency: "Monthly",
    retrievedAt: "2026-08-01T00:00:00.000Z",
    status: "VALID",
    metadata: {},
  };
}

test("Taiwan CPI evaluates cached YoY after a DGBAS refresh failure", async () => {
  const cached = {
    retrievedAt: "2026-08-01T00:00:00.000Z",
    observations: [
      cpiObservation("2025-07-01", 109.57),
      cpiObservation("2025-08-01", 109.8),
      cpiObservation("2025-09-01", 110.1),
      cpiObservation("2025-10-01", 110.3),
      cpiObservation("2025-11-01", 110.5),
      cpiObservation("2025-12-01", 110.7),
      cpiObservation("2026-01-01", 110.9),
      cpiObservation("2026-02-01", 111.1),
      cpiObservation("2026-03-01", 111.3),
      cpiObservation("2026-04-01", 111.5),
      cpiObservation("2026-05-01", 111.8),
      cpiObservation("2026-06-01", 112.0),
      cpiObservation("2026-07-01", 112.35),
    ],
  };
  const historyPreparation = new HistoryPreparationService({
    adapters: {
      DGBAS: {
        getHistory: async () => {
          throw Object.assign(new Error("unable to verify the first certificate"), {
            code: "DGBAS_NETWORK_ERROR",
          });
        },
      },
    },
    sourceConfigs: [sourceConfig],
    historyCache: {
      read: async () => cached,
      write: async () => assert.fail("failed refresh must not overwrite the cache"),
    },
    maxCacheAgeMs: 0,
    now: () => new Date("2026-09-14T00:00:00.000Z"),
  });
  const evaluation = await new SignalEvaluationService({
    historyPreparation,
    signalEngine: new SignalEngine({ now: () => new Date("2026-09-14T00:00:00.000Z") }),
    resolveRule: getSignalRule,
  }).evaluate(entry);

  assert.equal(evaluation.history.ready, true);
  assert.equal(evaluation.history.cacheStatus, "PREVIOUS_CACHE_RETAINED");
  assert.match(evaluation.history.error, /DGBAS_NETWORK_ERROR/);
  assert.ok(Math.abs(evaluation.transformedResult.value - 2.5371908369) < 1e-9);
  assert.equal(evaluation.signal.status, "EVALUATED");
  assert.equal(evaluation.signal.color, "YELLOW");
});
