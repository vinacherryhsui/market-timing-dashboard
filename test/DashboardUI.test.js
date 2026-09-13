import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { buildDashboardViewModel } from "../src/features/dashboard/dashboardViewModel.js";

test("React dashboard renders nine color-backed names, summary, and accessible signal labels", async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { Dashboard } = await vite.ssrLoadModule("/src/features/dashboard/Dashboard.jsx");
    const grid = createDemoGridConfiguration();
    const results = grid.configuredEntryIds.map((entry, index) => ({
      entry,
      signal: { color: index === 0 ? "UNKNOWN" : index === 1 ? "YELLOW" : index === 2 ? "RED" : "GREEN" },
    }));
    const html = renderToStaticMarkup(React.createElement(Dashboard, { viewModel: buildDashboardViewModel(grid, results) }));
    assert.equal((html.match(/class="signal-cell(?: |")/g) ?? []).length, 9);
    assert.equal((html.match(/class="card-inner signal-/g) ?? []).length, 9, "every card background belongs to its rotating plane");
    assert.match(html, />Nonfarm Payrolls</);
    assert.match(html, />10Y–2Y Yield Curve</);
    assert.doesNotMatch(html, />yield_curve_10y3m</);
    for (const className of ["signal-unknown", "signal-yellow", "signal-red", "signal-green"]) assert.match(html, new RegExp(className));
    assert.match(html, /aria-label="Show quick information for Nonfarm Payrolls; Unknown signal; draggable grid card"/);
    assert.match(html, /Market Environment/);
    assert.match(html, /Market Score/);
    assert.match(html, /Coverage/);
    assert.match(html, /About Market Score/);
    assert.match(html, /How Market Score works/);
    assert.match(html, /Green = \+1/);
    assert.match(html, /Unknown signals are excluded/);
    assert.match(html, /above \+0.30/);
    assert.doesNotMatch(html, /A compact view of the market signals you selected/);
    assert.doesNotMatch(html, /Normalized summary score, not a probability/);
  } finally {
    await vite.close();
  }
});
