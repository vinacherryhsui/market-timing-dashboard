import test from "node:test";
import assert from "node:assert/strict";
import { GridConfiguration, createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { DashboardController } from "../src/features/dashboard/DashboardController.js";

const evaluation = (entry, color = "GREEN") => ({ entry, observationDate: "2026-09-01", signal: { color, transformedValue: 1 } });

test("controller adds through GridConfiguration first slot and recomputes score", async () => {
  const loaded = [];
  const controller = new DashboardController({ grid: new GridConfiguration(), loadEvaluation: async (entry) => { loaded.push(entry); return evaluation(entry); } });
  assert.deepEqual(await controller.addIndicator("vix"), { status: "ADDED", position: 0 });
  assert.deepEqual(controller.grid.configuredEntryIds, ["vix"]);
  assert.deepEqual(loaded, ["vix"]);
  assert.equal(controller.viewModel.marketScore.marketScore, 1);
});

test("duplicate add is rejected without loading or duplicating state", async () => {
  const grid = new GridConfiguration();
  grid.addIndicator("vix");
  let calls = 0;
  const controller = new DashboardController({ grid, evaluations: [evaluation("vix")], loadEvaluation: async () => { calls += 1; } });
  assert.deepEqual(await controller.addIndicator("vix"), { status: "ALREADY_SELECTED" });
  assert.equal(calls, 0);
  assert.deepEqual(grid.configuredEntryIds, ["vix"]);
});

test("full grid requests explicit replacement and does not overwrite", async () => {
  const grid = createDemoGridConfiguration();
  const before = [...grid.configuredEntryIds];
  const controller = new DashboardController({ grid, loadEvaluation: async (entry) => evaluation(entry) });
  assert.deepEqual(await controller.addIndicator("sahm_rule"), { status: "REPLACE_REQUIRED" });
  assert.deepEqual(grid.configuredEntryIds, before);
});

test("replace changes only selected position, loads new signal, and updates score", async () => {
  const grid = createDemoGridConfiguration();
  const evaluations = grid.configuredEntryIds.map((entry) => evaluation(entry, "GREEN"));
  const controller = new DashboardController({ grid, evaluations, loadEvaluation: async (entry) => evaluation(entry, "RED") });
  const before = [...grid.configuredEntryIds];
  const result = await controller.replaceIndicator(3, "sahm_rule");
  assert.equal(result.status, "REPLACED");
  assert.equal(grid.slots[3].entryId, "sahm_rule");
  assert.deepEqual(grid.configuredEntryIds.filter((_, index) => index !== 3), before.filter((_, index) => index !== 3));
  assert.equal(controller.viewModel.marketScore.rawScore, 7);
});

test("remove preserves physical positions and recomputes configured count", () => {
  const grid = createDemoGridConfiguration();
  const controller = new DashboardController({ grid, evaluations: grid.configuredEntryIds.map((entry) => evaluation(entry)), loadEvaluation: async (entry) => evaluation(entry) });
  const neighbor = grid.slots[5].entryId;
  controller.removeIndicator(4);
  assert.equal(grid.slots[4].entryId, null);
  assert.equal(grid.slots[5].entryId, neighbor);
  assert.equal(controller.viewModel.marketScore.configuredCount, 8);
});

test("failed evaluation remains configured as UNKNOWN and excluded from score", async () => {
  const controller = new DashboardController({ grid: new GridConfiguration(), loadEvaluation: async () => { throw new Error("offline"); } });
  await controller.addIndicator("vix");
  assert.deepEqual(controller.grid.configuredEntryIds, ["vix"]);
  assert.equal(controller.viewModel.cells[0].color, "UNKNOWN");
  assert.equal(controller.viewModel.marketScore.validCount, 0);
});

test("source-specific siblings and both yield curves can coexist", async () => {
  const controller = new DashboardController({ grid: new GridConfiguration(), loadEvaluation: async (entry) => evaluation(entry) });
  for (const entry of ["cpi_core_cpi:headline", "cpi_core_cpi:core", "yield_curve_10y3m", "yield_curve_10y2y"]) await controller.addIndicator(entry);
  assert.deepEqual(controller.grid.configuredEntryIds, ["cpi_core_cpi:headline", "cpi_core_cpi:core", "yield_curve_10y3m", "yield_curve_10y2y"]);
});

test("move delegates positional swap to GridConfiguration without reloading or changing score", () => {
  let loads = 0;
  const grid = createDemoGridConfiguration();
  const controller = new DashboardController({
    grid,
    evaluations: grid.configuredEntryIds.map((entry) => evaluation(entry, "GREEN")),
    loadEvaluation: async (entry) => { loads += 1; return evaluation(entry); },
  });
  const beforeEntries = [...grid.configuredEntryIds].sort();
  const beforeScore = controller.viewModel.marketScore;
  const first = grid.slots[0].entryId;
  const second = grid.slots[1].entryId;
  controller.moveIndicator(0, 1);
  assert.equal(grid.slots[0].entryId, second);
  assert.equal(grid.slots[1].entryId, first);
  assert.deepEqual([...grid.configuredEntryIds].sort(), beforeEntries);
  assert.deepEqual(controller.viewModel.marketScore, beforeScore);
  assert.equal(loads, 0);
});

test("move to an empty slot preserves the hole and other physical positions", () => {
  const grid = createDemoGridConfiguration();
  const controller = new DashboardController({ grid, evaluations: [], loadEvaluation: async (entry) => evaluation(entry) });
  const removed = controller.removeIndicator(4);
  const moving = grid.slots[0].entryId;
  const untouched = grid.slots[1].entryId;
  controller.moveIndicator(0, 4);
  assert.equal(grid.slots[0].entryId, null);
  assert.equal(grid.slots[4].entryId, moving);
  assert.equal(grid.slots[1].entryId, untouched);
  assert.ok(!grid.configuredEntryIds.includes(removed));
});
