import { canonicalIndicatorMetadataV1 } from "../indicators/canonicalIndicatorMetadata.js";
import { validateSignalRuleSet } from "./SignalRule.js";

export function toSignalRuleCompatibilityEntry({ machine }) {
  const { entryId, identity, signal } = machine;
  return Object.freeze({
    ruleId: `${entryId}:signal:${signal.version}`,
    indicatorId: identity.indicatorId,
    sourceRole: identity.role,
    ...signal,
  });
}

export const activeSignalRuleRegistry = Object.freeze(validateSignalRuleSet(
  Object.values(canonicalIndicatorMetadataV1).map(toSignalRuleCompatibilityEntry),
));

const rulesByEntry = new Map(Object.keys(canonicalIndicatorMetadataV1).map(
  (entryId, index) => [entryId, activeSignalRuleRegistry[index]],
));

export function getSignalRule(entryId) {
  return rulesByEntry.get(entryId) ?? null;
}
