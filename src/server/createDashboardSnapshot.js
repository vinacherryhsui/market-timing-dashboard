import { FredAdapter } from "../data/fred/FredClient.js";
import { DgbasAdapter } from "../data/dgbas/DgbasClient.js";
import { ResearchFileAdapter } from "../data/research/ResearchFileAdapter.js";
import { HistoryCache } from "../data/acquisition/HistoryCache.js";
import { indicatorSources } from "../data/acquisition/indicatorSources.js";
import { createDemoGridConfiguration } from "../domain/grid/GridConfiguration.js";
import { HistoryPreparationService } from "../domain/history/HistoryPreparationService.js";
import { SignalEngine } from "../domain/signals/SignalEngine.js";
import { SignalEvaluationService } from "../domain/signals/SignalEvaluationService.js";
import { getSignalRule } from "../domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../domain/transformations/transformationRegistry.js";
import { buildDashboardViewModel } from "../features/dashboard/dashboardViewModel.js";
import { buildTransformedHistory } from "../domain/transformations/TransformedHistoryService.js";
import { getCanonicalIndicatorMetadataV1 } from "../domain/indicators/canonicalIndicatorMetadata.js";

const transformationsByEntry = new Map(activeTransformationRegistry.map((entry) => [entry.id, entry]));

function createEvaluationService() {
  const research = new ResearchFileAdapter();
  const historyPreparation = new HistoryPreparationService({
    adapters: {
      FRED: new FredAdapter(),
      DGBAS: new DgbasAdapter(),
      CALDARA_IACOVIELLO: research,
      POLICY_UNCERTAINTY: research,
      NY_FED: research,
    },
    sourceConfigs: indicatorSources,
    historyCache: new HistoryCache(),
  });
  return new SignalEvaluationService({
    historyPreparation,
    signalEngine: new SignalEngine(),
    resolveRule: getSignalRule,
  });
}

function normalizeEvaluation(result) {
  return {
    entry: result.entry,
    observationDate: result.history?.latestObservationDate ?? null,
    signal: result.signal,
  };
}

export async function createEntryEvaluation(entryId) {
  const entry = transformationsByEntry.get(entryId);
  if (!entry || !getSignalRule(entryId)) throw Object.assign(new Error(`Inactive dashboard entry: ${entryId}.`), { code: "DASHBOARD_ENTRY_INVALID" });
  return normalizeEvaluation(await createEvaluationService().evaluate(entry));
}

export async function createIndicatorDetail(entryId) {
  const entry = transformationsByEntry.get(entryId);
  const rule = getSignalRule(entryId);
  if (!entry || !rule) throw Object.assign(new Error(`Inactive dashboard entry: ${entryId}.`), { code: "DASHBOARD_ENTRY_INVALID" });
  const canonicalMetadata = getCanonicalIndicatorMetadataV1(entryId);
  const source = indicatorSources.find((item) => item.indicatorId === entry.indicatorId && item.datasetId === entry.source.datasetId && (item.role ?? null) === (entry.source.role ?? null));
  const research = new ResearchFileAdapter();
  const adapter = source?.provider === "FRED" ? new FredAdapter() : source?.provider === "DGBAS" ? new DgbasAdapter() : research;
  let history = { status: "UNAVAILABLE", points: [], reason: "History is unavailable." };
  let sourceMetadata = source?.metadata ?? {};
  try {
    const result = await adapter.getHistory(source, { ...entry.transformation, normalization: entry.transformation.parameters?.monthlyAggregation, maxHistory: true });
    history = { status: "AVAILABLE", points: buildTransformedHistory(entry, result.observations) };
    sourceMetadata = { ...result.observations?.find((item) => item.metadata)?.metadata, ...sourceMetadata };
  } catch (error) {
    history = { ...history, reason: error.message };
  }
  return {
    entryId, canonicalMetadata,
    source: { provider: source?.provider, datasetId: source?.datasetId, frequency: source?.frequency ?? sourceMetadata.frequency, unit: source?.unit ?? sourceMetadata.units, metadata: sourceMetadata },
    transformation: entry.transformation, rule, history,
  };
}

export async function createDashboardSnapshot() {
  const grid = createDemoGridConfiguration();
  const evaluation = createEvaluationService();
  const results = await Promise.all(grid.configuredEntryIds.map((entryId) => evaluation.evaluate(transformationsByEntry.get(entryId))));
  const evaluations = results.map((result) => ({
    ...result,
    observationDate: result.history?.latestObservationDate ?? null,
  }));
  return {
    ...buildDashboardViewModel(grid, evaluations),
    grid: grid.toJSON(),
    evaluations: results.map(normalizeEvaluation),
  };
}
