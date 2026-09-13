import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CACHE_DIR = fileURLToPath(new URL("../../../data/cache/history/", import.meta.url));

export class HistoryCache {
  constructor({ cacheDir = DEFAULT_CACHE_DIR } = {}) {
    this.cacheDir = cacheDir;
  }

  pathFor(sourceConfig) {
    const safeDatasetId = sourceConfig.datasetId.replace(/[^a-zA-Z0-9_.-]/g, "_");
    return resolve(this.cacheDir, `${sourceConfig.indicatorId}__${safeDatasetId}.json`);
  }

  async read(sourceConfig) {
    try {
      return JSON.parse(await readFile(this.pathFor(sourceConfig), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async write(sourceConfig, history) {
    const target = this.pathFor(sourceConfig);
    const temporary = `${target}.${process.pid}.tmp`;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(temporary, `${JSON.stringify(history, null, 2)}\n`, "utf8");
    await rename(temporary, target);
  }
}
