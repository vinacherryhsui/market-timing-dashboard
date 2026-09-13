import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activeIndicatorSources } from "../src/data/acquisition/indicatorSources.js";
import { buildTransformedHistory } from "../src/domain/transformations/TransformedHistoryService.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";

const root = resolve(import.meta.dirname, "..");
const researchDatasetPath = resolve(import.meta.dirname, "data", "transformed_histories.json");
try {
  const research = JSON.parse(await readFile(researchDatasetPath, "utf8"));
  if (Object.keys(research).length !== activeTransformationRegistry.length) throw new Error(`Research dataset has ${Object.keys(research).length}/${activeTransformationRegistry.length} active indicators.`);
  process.stdout.write(JSON.stringify(research));
  process.exit(0);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

function cachePath(source) {
  if (source.acquisitionMode === "PERIODIC_FILE") return resolve(root, "data", "cache", "research", `${source.indicatorId}.json`);
  return resolve(root, "data", "cache", "history", `${source.indicatorId}__${source.datasetId.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);
}
const sourcesByEntry = new Map(activeIndicatorSources.map((source) => [source.role ? `${source.indicatorId}:${source.role}` : source.indicatorId, source]));
const result = {};
for (const entry of activeTransformationRegistry) {
  const source = sourcesByEntry.get(entry.id);
  if (!source) throw new Error(`No active source configuration for ${entry.id}.`);
  const path = cachePath(source);
  const cache = JSON.parse(await readFile(path, "utf8"));
  const observations = (cache.observations ?? []).filter((item) => item.status === "VALID" && Number.isFinite(item.value));
  const points = buildTransformedHistory(entry, observations);
  result[entry.id] = { frequency: entry.transformation.frequency, sourcePath: path, rawObservationCount: observations.length, transformedObservationCount: points.length, points };
}
process.stdout.write(JSON.stringify(result));
