import test from "node:test";
import assert from "node:assert/strict";
import { activeGridEntryIds } from "../src/domain/grid/GridConfiguration.js";
import { canonicalIndicatorMetadataV1 } from "../src/domain/indicators/canonicalIndicatorMetadata.js";
import { CanonicalIndicatorMetadataValidationError, getCanonicalIndicatorOnboardingErrors, validateCanonicalIndicatorDefinition, validateCanonicalIndicatorMetadata, validateIndicatorOnboardingDefinition } from "../src/domain/indicators/validateCanonicalIndicatorMetadata.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";
import { activeSignalRuleRegistry } from "../src/domain/signals/signalRuleRegistry.js";
import { activeIndicatorSources } from "../src/data/acquisition/indicatorSources.js";

test("Canonical Indicator Metadata v1 validates all 21 active indicators", () => {
  assert.equal(Object.keys(canonicalIndicatorMetadataV1).length, 21);
  assert.equal(validateCanonicalIndicatorMetadata(canonicalIndicatorMetadataV1, { expectedEntryIds: activeGridEntryIds }), canonicalIndicatorMetadataV1);
});

test("canonical definitions keep machine values separate from display labels", () => {
  const definition = canonicalIndicatorMetadataV1.credit_spread_baa10y;
  assert.equal(definition.machine.source.rawFrequency, "DAILY");
  assert.equal(definition.display.frequencyLabel, "Daily");
  assert.equal(definition.machine.transformation.evaluationFrequency, "MONTHLY");
  assert.equal(definition.machine.source.rawUnit, "PERCENTAGE_POINTS");
  assert.equal(definition.display.transformationLabel, "36-month standardized credit spread");
  assert.equal(definition.display.calculationDescription, "First averages the daily Baa–10Y spread within each month, then compares the current monthly spread with its previous 36 months of history.");
});

test("all canonical definitions include fixed human-facing calculation content", () => {
  for (const [entryId, definition] of Object.entries(canonicalIndicatorMetadataV1)) {
    assert.ok(definition.display.transformationLabel.length > 0, `${entryId} transformationLabel`);
    assert.ok(definition.display.calculationDescription.length > 0, `${entryId} calculationDescription`);
  }
  assert.equal(canonicalIndicatorMetadataV1.nonfarm_payrolls.display.transformationLabel, "Monthly payroll change");
  assert.equal(canonicalIndicatorMetadataV1.credit_card_delinquency.display.calculationDescription, "Compares the current credit-card delinquency rate with its trailing 20-quarter median and checks whether it has risen or fallen over the past four quarters.");
});

test("all canonical definitions include a human-facing rule rationale", () => {
  for (const [entryId, definition] of Object.entries(canonicalIndicatorMetadataV1)) {
    assert.ok(definition.display.ruleRationale.length > 0, `${entryId} ruleRationale`);
  }
  assert.equal(canonicalIndicatorMetadataV1.sahm_rule.display.ruleRationale, "0.50 is the official Sahm recession trigger; 0.30 is used as an earlier warning threshold.");
});

test("canonical validation rejects incomplete onboarding definitions", () => {
  const valid = canonicalIndicatorMetadataV1.vix;
  assert.throws(() => validateCanonicalIndicatorDefinition({ ...valid, display: { ...valid.display, name: "" } }), CanonicalIndicatorMetadataValidationError);
  assert.throws(() => validateCanonicalIndicatorDefinition({ ...valid, display: { ...valid.display, calculationDescription: "" } }), CanonicalIndicatorMetadataValidationError);
  assert.throws(() => validateCanonicalIndicatorDefinition({ ...valid, display: { ...valid.display, ruleRationale: "" } }), CanonicalIndicatorMetadataValidationError);
  assert.throws(() => validateCanonicalIndicatorDefinition({ ...valid, machine: { ...valid.machine, source: { ...valid.machine.source, rawUnit: null } } }), CanonicalIndicatorMetadataValidationError);
  assert.throws(() => validateCanonicalIndicatorDefinition({ ...valid, display: { ...valid.display, dataNotes: [{ type: "guess", label: "Guess", text: "No." }] } }), CanonicalIndicatorMetadataValidationError);
  assert.doesNotThrow(() => validateCanonicalIndicatorDefinition({ ...valid, display: { ...valid.display, dataNotes: [] } }));
});

test("engine compatibility registries are exact derived views of canonical metadata", () => {
  for (const definition of Object.values(canonicalIndicatorMetadataV1)) {
    const { machine } = definition;
    const transformation = activeTransformationRegistry.find((entry) => entry.id === machine.entryId);
    const { evaluationFrequency, ...canonicalTransformation } = machine.transformation;
    assert.deepEqual(transformation, {
      id: machine.entryId,
      indicatorId: machine.identity.indicatorId,
      source: { datasetId: machine.source.datasetId, ...(machine.identity.role ? { role: machine.identity.role } : {}) },
      transformation: { ...canonicalTransformation, frequency: evaluationFrequency },
    });

    const signal = activeSignalRuleRegistry.find((rule) => rule.ruleId === `${machine.entryId}:signal:${machine.signal.version}`);
    assert.deepEqual(signal, {
      ruleId: `${machine.entryId}:signal:${machine.signal.version}`,
      indicatorId: machine.identity.indicatorId,
      sourceRole: machine.identity.role,
      ...machine.signal,
    });

    const source = activeIndicatorSources.find((candidate) => candidate.indicatorId === machine.identity.indicatorId
      && candidate.datasetId === machine.source.datasetId
      && (candidate.role ?? null) === machine.identity.role);
    assert.deepEqual(source, {
      indicatorId: machine.identity.indicatorId,
      provider: machine.source.providerId,
      datasetId: machine.source.datasetId,
      ...(machine.identity.role ? { role: machine.identity.role } : {}),
      ...machine.source.acquisition,
    });
  }
});

test("canonical validation checks provider acquisition and executable signal configuration", () => {
  const dgbas = canonicalIndicatorMetadataV1.taiwan_cpi;
  assert.throws(() => validateCanonicalIndicatorDefinition({
    ...dgbas,
    machine: { ...dgbas.machine, source: { ...dgbas.machine.source, acquisition: {} } },
  }), CanonicalIndicatorMetadataValidationError);

  const vix = canonicalIndicatorMetadataV1.vix;
  assert.throws(() => validateCanonicalIndicatorDefinition({
    ...vix,
    machine: { ...vix.machine, signal: { ...vix.machine.signal, evidenceBasis: "MADE_UP" } },
  }), CanonicalIndicatorMetadataValidationError);
});

test("onboarding validation reports all missing fields with readable paths", () => {
  const errors = getCanonicalIndicatorOnboardingErrors({ machine: { identity: {}, source: {}, transformation: {} }, display: {} });
  assert.ok(errors.length > 10);
  assert.ok(errors.includes("machine.entryId: is required"));
  assert.ok(errors.includes("machine.source.datasetId: is required"));
  assert.ok(errors.includes("display.marketImplication: is required"));
  assert.ok(!errors.some((error) => error.startsWith("display.dataNotes")));
  assert.throws(
    () => validateIndicatorOnboardingDefinition({ machine: { identity: {}, source: {}, transformation: {} }, display: {} }),
    (error) => error instanceof CanonicalIndicatorMetadataValidationError
      && error.message.includes("onboarding validation failed")
      && error.message.includes("machine.entryId")
      && error.message.includes("display.limitations"),
  );
});

test("all current canonical definitions pass the onboarding validator", () => {
  for (const definition of Object.values(canonicalIndicatorMetadataV1)) {
    assert.equal(validateIndicatorOnboardingDefinition(definition), definition);
  }
});
