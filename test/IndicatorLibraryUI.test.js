import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { activeGridEntryIds } from "../src/domain/grid/GridConfiguration.js";

test("Indicator Library renders all 21 active entries, grouped, with selected state", async () => {
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { IndicatorLibrary } = await vite.ssrLoadModule("/src/features/dashboard/IndicatorLibrary.jsx");
    const html = renderToStaticMarkup(React.createElement(IndicatorLibrary, { selectedEntryIds: ["vix"], onSelect: () => {}, pendingEntryId: null }));
    assert.equal(activeGridEntryIds.length, 21);
    assert.equal((html.match(/class="library-item(?: is-selected)?"/g) ?? []).length, 21);
    assert.match(html, /Nonfarm Payrolls/);
    assert.match(html, /Headline CPI/);
    assert.match(html, /Core CPI/);
    assert.match(html, /10Y–3M Yield Curve/);
    assert.match(html, /10Y–2Y Yield Curve/);
    assert.match(html, /VIX; selected/);
    assert.match(html, /class="library-item is-selected"/);
    assert.doesNotMatch(html, /Auto Sales/);
    assert.doesNotMatch(html, /Household Credit Balance/);
  } finally {
    await vite.close();
  }
});
