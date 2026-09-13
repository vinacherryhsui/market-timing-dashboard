import test from "node:test";
import assert from "node:assert/strict";
import { toSourceCompatibilityConfig } from "../src/data/acquisition/indicatorSources.js";
import { getCanonicalIndicatorOnboardingErrors, validateIndicatorOnboardingDefinition } from "../src/domain/indicators/validateCanonicalIndicatorMetadata.js";
import { EvidenceBasis, SignalRuleStatus, SignalRuleType, validateSignalRule } from "../src/domain/signals/SignalRule.js";
import { toSignalRuleCompatibilityEntry } from "../src/domain/signals/signalRuleRegistry.js";
import { TransformationFrequency, TransformationType } from "../src/domain/transformations/TransformationDefinition.js";
import { toTransformationCompatibilityEntry } from "../src/domain/transformations/transformationRegistry.js";

function syntheticDefinition() {
  return {
    machine: {
      entryId: "synthetic_activity_index",
      identity: { indicatorId: "synthetic_activity_index" },
      source: { providerId: "FRED", datasetId: "SYNTHETIC_TEST_SERIES", rawFrequency: "MONTHLY", rawUnit: "INDEX", acquisition: {} },
      transformation: { type: TransformationType.PASSTHROUGH, evaluationFrequency: TransformationFrequency.MONTHLY, requiredPeriods: 1, outputUnit: "SOURCE_UNIT", lag: null, window: null, parameters: {}, version: "1.0.0" },
      signal: {
        type: SignalRuleType.SIMPLE_RANGE,
        parameters: { input: "value", branches: [
          { color: "GREEN", anyOf: [{ all: [{ input: "value", operator: ">", value: 0 }] }] },
          { color: "YELLOW", anyOf: [{ all: [{ input: "value", operator: "==", value: 0 }] }] },
          { color: "RED", anyOf: [{ all: [{ input: "value", operator: "<", value: 0 }] }] },
        ] },
        evidenceBasis: EvidenceBasis.AUTHOR_DEFINED,
        status: SignalRuleStatus.CONFIRMED,
        methodology: {},
        version: "1.0.0",
      },
    },
    display: {
      name: "Synthetic Activity Index", theme: "Growth", sentenceSubject: "The synthetic activity index",
      providerLabel: "Federal Reserve Economic Data (FRED)", frequencyLabel: "Monthly",
      transformationLabel: "Current monthly reading", calculationDescription: "Uses the latest monthly source value.",
      ruleRationale: "Positive, zero, and negative values define the three test bands.",
      marketImplication: "Higher readings represent stronger synthetic activity in this test fixture.",
      limitations: "This is synthetic test data and has no real-world economic interpretation.",
      quickInfo: { valueStyle: "INDEX", interpretationStyle: "SYNTHETIC", subject: "The synthetic activity index", wording: "SYNTHETIC" },
    },
  };
}

test("a test-only 22nd indicator passes the complete onboarding contract", () => {
  const definition = syntheticDefinition();
  assert.equal(validateIndicatorOnboardingDefinition(definition), definition);
  assert.deepEqual(getCanonicalIndicatorOnboardingErrors(definition), []);
  assert.equal(definition.machine.identity.role, undefined);
  assert.equal(definition.display.dataNotes, undefined);
});

test("onboarding errors identify all missing required paths", () => {
  const definition = syntheticDefinition();
  delete definition.machine.source.datasetId;
  delete definition.display.calculationDescription;
  const errors = getCanonicalIndicatorOnboardingErrors(definition);
  assert.ok(errors.includes("machine.source.datasetId: is required"));
  assert.ok(errors.includes("display.calculationDescription: is required"));
});

test("provider-specific onboarding requirements are enforced", () => {
  const definition = syntheticDefinition();
  definition.machine.source.providerId = "DGBAS";
  const errors = getCanonicalIndicatorOnboardingErrors(definition);
  assert.ok(errors.includes("machine.source.acquisition.endpoint: is required for DGBAS"));
  assert.ok(errors.includes("machine.source.acquisition.selector: is required for DGBAS"));
});

test("synthetic definition uses generic compatibility converters", () => {
  const definition = syntheticDefinition();
  const transformation = toTransformationCompatibilityEntry(definition);
  const signal = toSignalRuleCompatibilityEntry(definition);
  const source = toSourceCompatibilityConfig(definition);
  assert.equal(transformation.id, definition.machine.entryId);
  assert.equal(transformation.transformation.type, TransformationType.PASSTHROUGH);
  assert.equal(transformation.transformation.frequency, TransformationFrequency.MONTHLY);
  assert.equal(validateSignalRule(signal), signal);
  assert.deepEqual(source, { indicatorId: "synthetic_activity_index", provider: "FRED", datasetId: "SYNTHETIC_TEST_SERIES" });
});
