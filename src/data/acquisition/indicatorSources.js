import { canonicalIndicatorMetadataV1 } from "../../domain/indicators/canonicalIndicatorMetadata.js";

// Sources that are available to the catalogue but are not part of the active
// 21-indicator engine remain outside the canonical active-entry contract.
export const catalogueOnlyIndicatorSources = Object.freeze([
  Object.freeze({ indicatorId: "auto_sales", provider: "FRED", datasetId: "TOTALSA" }),
  Object.freeze({ indicatorId: "permits_starts", provider: "FRED", datasetId: "HOUST", role: "starts" }),
  Object.freeze({ indicatorId: "budget_deficit_gdp", provider: "FRED", datasetId: "FYFSGDA188S" }),
  Object.freeze({ indicatorId: "ppi", provider: "FRED", datasetId: "PPIACO" }),
  Object.freeze({ indicatorId: "household_credit_balance", provider: "FRED", datasetId: "HCCSDODNS" }),
  Object.freeze({ indicatorId: "revolving_credit_balance", provider: "FRED", datasetId: "CCLACBM027SBOG" }),
  Object.freeze({
    indicatorId: "eia_crude_inventories",
    provider: "EIA",
    datasetId: "WCESTUS1",
    route: "petroleum/stoc/wstk/data/",
    frequency: "weekly",
  }),
]);

export function toSourceCompatibilityConfig({ machine }) {
  const { identity, source } = machine;
  return Object.freeze({
    indicatorId: identity.indicatorId,
    provider: source.providerId,
    datasetId: source.datasetId,
    ...(identity.role ? { role: identity.role } : {}),
    ...source.acquisition,
  });
}

export const activeIndicatorSources = Object.freeze(
  Object.values(canonicalIndicatorMetadataV1).map(toSourceCompatibilityConfig),
);

export const indicatorSources = Object.freeze([
  ...catalogueOnlyIndicatorSources,
  ...activeIndicatorSources,
]);

export function getIndicatorSourceConfigs(indicatorId) {
  return indicatorSources.filter((config) => config.indicatorId === indicatorId);
}
