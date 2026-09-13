import { validateSignalRule } from "../signals/SignalRule.js";
import { defineTransformation, TransformationFrequency, TransformationType } from "../transformations/TransformationDefinition.js";

const PROVIDERS = new Set(["FRED", "DGBAS", "CALDARA_IACOVIELLO", "POLICY_UNCERTAINTY", "NY_FED"]);
const PERIODIC_FILE_PROVIDERS = new Set(["CALDARA_IACOVIELLO", "POLICY_UNCERTAINTY", "NY_FED"]);
const NOTE_TYPES = new Set(["source", "calculation", "release_timing", "revision", "coverage", "licensing", "other"]);
const RAW_FREQUENCIES = new Set(["DAILY", "MONTHLY", "QUARTERLY"]);
const RAW_UNITS = new Set(["THOUSANDS_OF_PERSONS", "PERCENT", "PERCENTAGE_POINTS", "INDEX", "MILLIONS_OF_DOLLARS", "THOUSANDS_OF_UNITS_SAAR", "CHAIN_TYPE_PRICE_INDEX", "PRICE_INDEX", "PRICE_INDEX_2021_100", "STANDARD_DEVIATIONS", "INDEX_1985_2019_100", "ARTICLE_SHARE_INDEX"]);
const REQUIRED_DISPLAY_FIELDS = ["name", "theme", "sentenceSubject", "providerLabel", "frequencyLabel", "transformationLabel", "calculationDescription", "ruleRationale", "marketImplication", "limitations"];
const REQUIRED_QUICK_INFO_FIELDS = ["valueStyle", "interpretationStyle", "subject", "wording"];
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;

export class CanonicalIndicatorMetadataValidationError extends Error {
  constructor(entryId, message) {
    super(`${entryId ?? "unknown entry"}: ${message}`);
    this.name = "CanonicalIndicatorMetadataValidationError";
    this.code = "CANONICAL_INDICATOR_METADATA_INVALID";
  }
}

function collectCanonicalIndicatorErrors(definition) {
  const errors = [];
  const machine = definition?.machine;
  const display = definition?.display;
  const entryId = machine?.entryId;
  const add = (condition, path, message) => { if (!condition) errors.push(`${path}: ${message}`); };

  add(nonEmpty(entryId), "machine.entryId", "is required");
  add(nonEmpty(machine?.identity?.indicatorId), "machine.identity.indicatorId", "is required");
  add(machine?.identity?.role == null || nonEmpty(machine?.identity?.role), "machine.identity.role", "must be omitted, null, or a non-empty string");
  if (nonEmpty(entryId) && nonEmpty(machine?.identity?.indicatorId)) {
    const expectedEntryId = machine.identity.role ? `${machine.identity.indicatorId}:${machine.identity.role}` : machine.identity.indicatorId;
    add(entryId === expectedEntryId, "machine.entryId", `must equal ${expectedEntryId} for the supplied identity`);
  }

  for (const field of REQUIRED_DISPLAY_FIELDS) add(nonEmpty(display?.[field]), `display.${field}`, "is required");
  for (const field of REQUIRED_QUICK_INFO_FIELDS) add(nonEmpty(display?.quickInfo?.[field]), `display.quickInfo.${field}`, "is required");

  add(PROVIDERS.has(machine?.source?.providerId), "machine.source.providerId", "is unsupported or missing");
  add(nonEmpty(machine?.source?.datasetId), "machine.source.datasetId", "is required");
  add(RAW_FREQUENCIES.has(machine?.source?.rawFrequency), "machine.source.rawFrequency", "is unsupported or missing");
  add(RAW_UNITS.has(machine?.source?.rawUnit), "machine.source.rawUnit", "is unsupported or missing");
  add(machine?.source?.acquisition && typeof machine.source.acquisition === "object" && !Array.isArray(machine.source.acquisition), "machine.source.acquisition", "must be an object; use {} when the provider needs no per-series options");

  const acquisition = machine?.source?.acquisition;
  if (machine?.source?.providerId === "DGBAS" && acquisition) {
    add(nonEmpty(acquisition.endpoint), "machine.source.acquisition.endpoint", "is required for DGBAS");
    add(acquisition.selector && typeof acquisition.selector === "object", "machine.source.acquisition.selector", "is required for DGBAS");
    add(nonEmpty(acquisition.selector?.frequencyCode), "machine.source.acquisition.selector.frequencyCode", "is required for DGBAS");
  }
  if (PERIODIC_FILE_PROVIDERS.has(machine?.source?.providerId) && acquisition) {
    add(acquisition.acquisitionMode === "PERIODIC_FILE", "machine.source.acquisition.acquisitionMode", "must be PERIODIC_FILE for this provider");
    for (const field of ["endpoint", "format", "sheet", "valueColumn"]) {
      add(nonEmpty(acquisition[field]), `machine.source.acquisition.${field}`, `is required for ${machine.source.providerId}`);
    }
    add(nonEmpty(acquisition.dateColumn) || (nonEmpty(acquisition.yearColumn) && nonEmpty(acquisition.monthColumn)), "machine.source.acquisition", "requires dateColumn or both yearColumn and monthColumn");
  }

  add(Object.values(TransformationType).includes(machine?.transformation?.type), "machine.transformation.type", "is unsupported or missing");
  add(Object.values(TransformationFrequency).includes(machine?.transformation?.evaluationFrequency), "machine.transformation.evaluationFrequency", "is unsupported or missing");
  add(Number.isInteger(machine?.transformation?.requiredPeriods) && machine.transformation.requiredPeriods > 0, "machine.transformation.requiredPeriods", "must be a positive integer");
  add(nonEmpty(machine?.transformation?.outputUnit), "machine.transformation.outputUnit", "is required");
  add(nonEmpty(machine?.transformation?.version), "machine.transformation.version", "is required");
  add(machine?.transformation?.parameters && typeof machine.transformation.parameters === "object" && !Array.isArray(machine.transformation.parameters), "machine.transformation.parameters", "must be an object; use {} when no parameters are needed");
  if (machine?.transformation) {
    try {
      defineTransformation({ ...machine.transformation, frequency: machine.transformation.evaluationFrequency });
    } catch (error) {
      errors.push(`machine.transformation: ${error.message}`);
    }
  }

  if (machine?.signal) {
    try {
      validateSignalRule({ ruleId: `${entryId}:signal:${machine.signal.version}`, indicatorId: machine.identity?.indicatorId, sourceRole: machine.identity?.role, ...machine.signal }, { allowReviewNeeded: true });
    } catch (error) {
      errors.push(`machine.signal: ${error.message}`);
    }
  } else {
    errors.push("machine.signal: is required");
  }

  add(display?.dataNotes === undefined || Array.isArray(display.dataNotes), "display.dataNotes", "must be an array when supplied; use [] when there are no useful notes");
  if (Array.isArray(display?.dataNotes)) {
    display.dataNotes.forEach((note, index) => {
      add(NOTE_TYPES.has(note?.type), `display.dataNotes[${index}].type`, "is unsupported or missing");
      add(nonEmpty(note?.label), `display.dataNotes[${index}].label`, "is required");
      add(nonEmpty(note?.text), `display.dataNotes[${index}].text`, "is required");
    });
  }
  return errors;
}

export function getCanonicalIndicatorOnboardingErrors(definition) {
  return Object.freeze(collectCanonicalIndicatorErrors(definition));
}

export function validateCanonicalIndicatorDefinition(definition) {
  const errors = collectCanonicalIndicatorErrors(definition);
  if (errors.length) throw new CanonicalIndicatorMetadataValidationError(definition?.machine?.entryId, errors[0]);
  return definition;
}

export function validateIndicatorOnboardingDefinition(definition) {
  const errors = collectCanonicalIndicatorErrors(definition);
  if (errors.length) {
    throw new CanonicalIndicatorMetadataValidationError(definition?.machine?.entryId, `onboarding validation failed:\n- ${errors.join("\n- ")}`);
  }
  return definition;
}

export function validateCanonicalIndicatorMetadata(metadata, { expectedEntryIds = [] } = {}) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new CanonicalIndicatorMetadataValidationError(null, "metadata must be an object");
  const entries = Object.entries(metadata);
  if (!entries.length) throw new CanonicalIndicatorMetadataValidationError(null, "metadata must contain definitions");
  for (const [key, definition] of entries) {
    if (key !== definition?.machine?.entryId) throw new CanonicalIndicatorMetadataValidationError(key, "registry key must match machine.entryId");
    validateCanonicalIndicatorDefinition(definition);
  }
  if (expectedEntryIds.length) {
    const actual = new Set(entries.map(([entryId]) => entryId));
    if (actual.size !== expectedEntryIds.length || !expectedEntryIds.every((entryId) => actual.has(entryId))) {
      throw new CanonicalIndicatorMetadataValidationError(null, "active entry coverage is incomplete");
    }
  }
  return metadata;
}
