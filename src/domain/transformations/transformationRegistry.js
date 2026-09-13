import { canonicalIndicatorMetadataV1 } from "../indicators/canonicalIndicatorMetadata.js";
import { defineTransformation } from "./TransformationDefinition.js";

export function toTransformationCompatibilityEntry({ machine }) {
  const { entryId, identity, source, transformation } = machine;
  return Object.freeze({
    id: entryId,
    indicatorId: identity.indicatorId,
    source: Object.freeze({ datasetId: source.datasetId, ...(identity.role ? { role: identity.role } : {}) }),
    transformation: defineTransformation({ ...transformation, frequency: transformation.evaluationFrequency }),
  });
}

export const activeTransformationRegistry = Object.freeze(
  Object.values(canonicalIndicatorMetadataV1).map(toTransformationCompatibilityEntry),
);

export function getActiveTransformations(indicatorId) {
  return activeTransformationRegistry.filter((entry) => entry.indicatorId === indicatorId);
}
