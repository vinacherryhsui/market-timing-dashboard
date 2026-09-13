import test from "node:test";
import assert from "node:assert/strict";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { buildDashboardViewModel, formatMarketScore } from "../src/features/dashboard/dashboardViewModel.js";

const colors = ["GREEN", "GREEN", "GREEN", "GREEN", "RED", "YELLOW", "GREEN", "GREEN", "RED"];

function demoResults(overrides = {}) {
  return createDemoGridConfiguration().configuredEntryIds.map((entry, index) => ({
    entry,
    signal: { color: overrides[entry] ?? colors[index], status: "EVALUATED", reason: "test" },
  }));
}

test("dashboard view model renders the nine default labels in grid order", () => {
  const viewModel = buildDashboardViewModel(createDemoGridConfiguration(), demoResults());
  assert.equal(viewModel.cells.length, 9);
  assert.deepEqual(viewModel.cells.map((cell) => cell.name), [
    "Nonfarm Payrolls", "U-6 Underemployment", "University of Michigan Consumer Sentiment", "Core CPI", "10Y–2Y Yield Curve",
    "Credit Card Delinquency", "VIX", "Global Supply Chain Pressure", "Global GPR",
  ]);
  assert.deepEqual(viewModel.cells.map((cell) => cell.className), [
    "signal-green", "signal-green", "signal-green", "signal-green", "signal-red",
    "signal-yellow", "signal-green", "signal-green", "signal-red",
  ]);
});

test("dashboard score comes from Market Score domain output", () => {
  const viewModel = buildDashboardViewModel(createDemoGridConfiguration(), demoResults());
  assert.equal(viewModel.marketScore.rawScore, 4);
  assert.equal(viewModel.marketScore.marketScore, 4 / 9);
  assert.equal(viewModel.marketScore.regime, "BULLISH");
  assert.equal(formatMarketScore(viewModel.marketScore.marketScore), "+0.44");
});

test("UNKNOWN remains gray and is excluded from score without leaving the grid", () => {
  const grid = createDemoGridConfiguration();
  const viewModel = buildDashboardViewModel(grid, demoResults({ nonfarm_payrolls: "UNKNOWN" }));
  assert.equal(viewModel.cells.length, 9);
  assert.equal(viewModel.cells[0].className, "signal-unknown");
  assert.equal(viewModel.marketScore.validCount, 8);
  assert.equal(viewModel.marketScore.unknownCount, 1);
  assert.equal(viewModel.marketScore.marketScore, 3 / 8);
  assert.equal(viewModel.marketScore.regime, "BULLISH");
});

test("missing evaluation fails safely to UNKNOWN", () => {
  const viewModel = buildDashboardViewModel(createDemoGridConfiguration(), []);
  assert.ok(viewModel.cells.every((cell) => cell.color === "UNKNOWN"));
  assert.equal(viewModel.marketScore.regime, "UNKNOWN");
});
