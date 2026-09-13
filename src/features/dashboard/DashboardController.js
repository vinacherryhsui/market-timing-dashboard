import { GridConfiguration } from "../../domain/grid/GridConfiguration.js";
import { buildDashboardViewModel } from "./dashboardViewModel.js";

function unknownEvaluation(entry, reason = "EVALUATION_PENDING") {
  return { entry, observationDate: null, signal: { color: "UNKNOWN", status: "UNKNOWN", transformedValue: null, reason } };
}

export class DashboardController {
  constructor({ grid, evaluations = [], loadEvaluation }) {
    if (!(grid instanceof GridConfiguration)) throw new TypeError("DashboardController requires GridConfiguration.");
    if (typeof loadEvaluation !== "function") throw new TypeError("DashboardController requires loadEvaluation.");
    this.grid = grid;
    this.evaluations = new Map(evaluations.map((result) => [result.entry, result]));
    this.loadEvaluation = loadEvaluation;
  }

  get viewModel() { return buildDashboardViewModel(this.grid, [...this.evaluations.values()]); }
  isSelected(entryId) { return this.grid.configuredEntryIds.includes(entryId); }

  setGrid(grid) {
    if (!(grid instanceof GridConfiguration)) throw new TypeError("DashboardController requires GridConfiguration.");
    this.grid = grid;
  }

  async load(entryId) {
    this.evaluations.set(entryId, unknownEvaluation(entryId));
    try {
      this.evaluations.set(entryId, await this.loadEvaluation(entryId));
    } catch (error) {
      this.evaluations.set(entryId, unknownEvaluation(entryId, `EVALUATION_REQUEST_FAILED: ${error.message}`));
    }
  }

  async addIndicator(entryId) {
    if (this.isSelected(entryId)) return { status: "ALREADY_SELECTED" };
    if (!this.grid.slots.some((slot) => slot.entryId === null)) return { status: "REPLACE_REQUIRED" };
    const position = this.grid.addIndicator(entryId);
    await this.load(entryId);
    return { status: "ADDED", position };
  }

  removeIndicator(position) {
    const removed = this.grid.removeIndicator(position);
    if (removed) this.evaluations.delete(removed);
    return removed;
  }

  moveIndicator(fromPosition, toPosition) {
    this.grid.moveIndicator(fromPosition, toPosition);
    return { status: "MOVED", fromPosition, toPosition };
  }

  async replaceIndicator(position, entryId) {
    const previous = this.grid.slots[position].entryId;
    const changed = this.grid.replaceIndicator(position, entryId);
    if (!changed) return { status: "UNCHANGED", position };
    if (previous) this.evaluations.delete(previous);
    await this.load(entryId);
    return { status: "REPLACED", position, previous };
  }
}

export async function fetchEntryEvaluation(entryId) {
  const response = await fetch(`/api/dashboard?entryId=${encodeURIComponent(entryId)}`);
  if (!response.ok) throw new Error(`Signal request failed with HTTP ${response.status}.`);
  return response.json();
}

export async function fetchIndicatorDetail(entryId) {
  const response = await fetch(`/api/indicator-detail?entryId=${encodeURIComponent(entryId)}`);
  if (!response.ok) throw new Error(`Indicator detail request failed (${response.status}).`);
  return response.json();
}
