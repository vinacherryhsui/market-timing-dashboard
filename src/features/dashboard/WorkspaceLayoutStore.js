import { GridConfiguration } from "../../domain/grid/GridConfiguration.js";

export const CURRENT_WORKSPACE_KEY = "market-timing-dashboard.current-workspace.v1";
export const SAVED_LAYOUTS_KEY = "market-timing-dashboard.saved-layouts.v1";
const LAYOUTS_VERSION = 1;

export class WorkspaceLayoutStore {
  constructor(storage, { now = () => new Date().toISOString(), createId = () => globalThis.crypto?.randomUUID?.() ?? `layout-${Date.now()}` } = {}) {
    this.storage = storage;
    this.now = now;
    this.createId = createId;
  }

  loadCurrent() {
    try {
      const value = this.storage?.getItem(CURRENT_WORKSPACE_KEY);
      return value ? GridConfiguration.fromJSON(JSON.parse(value)) : null;
    } catch { return null; }
  }

  hasCurrentValue() {
    try { return this.storage?.getItem(CURRENT_WORKSPACE_KEY) !== null; } catch { return false; }
  }

  saveCurrent(grid) {
    try { this.storage?.setItem(CURRENT_WORKSPACE_KEY, JSON.stringify(grid.toJSON())); } catch { /* storage is best-effort */ }
  }

  listLayouts() {
    try {
      const value = this.storage?.getItem(SAVED_LAYOUTS_KEY);
      if (!value) return [];
      const saved = JSON.parse(value);
      if (!saved || saved.version !== LAYOUTS_VERSION || !Array.isArray(saved.layouts)) return [];
      return saved.layouts.flatMap((layout) => {
        if (!layout || typeof layout.id !== "string" || typeof layout.name !== "string" || !layout.name.trim()
          || typeof layout.createdAt !== "string" || typeof layout.updatedAt !== "string") return [];
        try {
          GridConfiguration.fromJSON(layout.grid);
          return [{ id: layout.id, name: layout.name, grid: layout.grid, createdAt: layout.createdAt, updatedAt: layout.updatedAt }];
        } catch { return []; }
      });
    } catch { return []; }
  }

  saveAs(name, grid) {
    const trimmedName = String(name ?? "").trim();
    if (!trimmedName) throw new TypeError("Layout name is required.");
    const timestamp = this.now();
    const layout = { id: this.createId(), name: trimmedName, grid: grid.toJSON(), createdAt: timestamp, updatedAt: timestamp };
    const layouts = [...this.listLayouts(), layout];
    this.storage?.setItem(SAVED_LAYOUTS_KEY, JSON.stringify({ version: LAYOUTS_VERSION, layouts }));
    return layout;
  }

  loadLayout(id) {
    const layout = this.listLayouts().find((candidate) => candidate.id === id);
    return layout ? GridConfiguration.fromJSON(layout.grid) : null;
  }

  deleteLayout(id) {
    const layouts = this.listLayouts().filter((layout) => layout.id !== id);
    this.storage?.setItem(SAVED_LAYOUTS_KEY, JSON.stringify({ version: LAYOUTS_VERSION, layouts }));
  }
}
