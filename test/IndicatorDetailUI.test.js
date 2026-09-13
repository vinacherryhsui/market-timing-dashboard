import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";
import { getSignalRule } from "../src/domain/signals/signalRuleRegistry.js";
import { activeTransformationRegistry } from "../src/domain/transformations/transformationRegistry.js";
import { canonicalIndicatorMetadataV1 } from "../src/domain/indicators/canonicalIndicatorMetadata.js";

test("all 21 active indicators have canonical detail information metadata", () => {
  assert.equal(Object.keys(canonicalIndicatorMetadataV1).length, 21);
  assert.deepEqual(new Set(Object.keys(canonicalIndicatorMetadataV1)), new Set(activeTransformationRegistry.map(entry => entry.id)));
  for (const [entryId, metadata] of Object.entries(canonicalIndicatorMetadataV1)) {
    assert.ok(metadata.display.marketImplication.length > 80, `${entryId} market implication`);
    assert.ok(metadata.display.limitations.length > 80, `${entryId} limitations`);
    assert.ok(metadata.display.dataNotes[0].text.length > 80, `${entryId} data notes`);
  }
});

test("indicator detail opens from a flipped card, switches ranges, and returns to Library", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document }); Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ render, fireEvent, waitFor, cleanup, within }, { DashboardWorkspace }] = await Promise.all([import("@testing-library/react"), vite.ssrLoadModule("/src/features/dashboard/DashboardWorkspace.jsx")]);
    const grid = createDemoGridConfiguration();
    const initialSnapshot = { grid: grid.toJSON(), evaluations: grid.configuredEntryIds.map(entry => ({ entry, observationDate: "2026-08-01", signal: { color: "GREEN", transformedValue: 7 } })) };
    const transformation = activeTransformationRegistry.find(item => item.id === "nonfarm_payrolls").transformation;
    const points = Array.from({ length: 80 }, (_, index) => ({ observationDate: `${2020 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}-01`, value: index }));
    const canonicalMetadata = canonicalIndicatorMetadataV1.nonfarm_payrolls;
    const loadDetail = async () => ({ canonicalMetadata, source: { provider: "RAW_PROVIDER", datasetId: "RAW_SERIES", frequency: "RAW_FREQUENCY", unit: "RAW_UNIT", metadata: { disclaimer: "provider disclaimer must not render" } }, transformation, rule: getSignalRule("nonfarm_payrolls"), history: { status: "AVAILABLE", points } });
    const rendered = render(React.createElement(DashboardWorkspace, { initialSnapshot, loadEvaluation: async () => {}, loadDetail, storage: null }));
    fireEvent.click(rendered.getByRole("button", { name: /Show quick information for Nonfarm Payrolls/ }));
    fireEvent.click(rendered.getByRole("button", { name: "Details" }));
    await waitFor(() => assert.ok(rendered.getByRole("region", { name: "Indicator Detail" })));
    const detailRegion = within(rendered.getByRole("region", { name: "Indicator Detail" }));
    assert.ok(rendered.getAllByText("+7 thousand jobs").length); assert.ok(rendered.getAllByText("August 2026").length);
    assert.ok(rendered.getByText("Monthly payroll change"));
    assert.ok(rendered.getByText("Measures the change in total nonfarm payroll employment from the previous month."));
    assert.ok(rendered.getByRole("heading", { name: "Method & Data" }));
    assert.equal(detailRegion.queryByText("Series"), null); assert.equal(detailRegion.queryByText("PAYEMS"), null);
    assert.equal(detailRegion.queryByText("Measure"), null); assert.equal(detailRegion.queryByText("Thousands of persons"), null);
    assert.equal(rendered.queryByText("MONTHLY_DIFFERENCE"), null); assert.equal(rendered.queryByText("AUTHOR_DEFINED"), null);
    assert.equal(rendered.queryByText("RAW_PROVIDER"), null); assert.equal(rendered.queryByText("RAW_SERIES"), null);
    assert.ok(rendered.getByRole("heading", { name: "Market Implication" }));
    assert.ok(rendered.getByRole("heading", { name: "Signal Rules" }));
    assert.equal(rendered.queryByRole("heading", { name: "Equity-market interpretation" }), null);
    assert.ok(rendered.getByText(canonicalMetadata.display.marketImplication));
    assert.equal(detailRegion.queryByText("Monthly payroll growth is above +122K."), null);
    assert.ok(rendered.getByRole("heading", { name: "Limitations" }));
    assert.ok(rendered.getByText(canonicalMetadata.display.limitations));
    const additionalDetails = rendered.getByText("Additional details").closest("details");
    assert.ok(additionalDetails); assert.equal(additionalDetails.open, false);
    assert.ok(rendered.getByRole("heading", { name: "Data Notes" }));
    assert.ok(rendered.getByText(canonicalMetadata.display.dataNotes[0].text));
    assert.ok(rendered.getByText(canonicalMetadata.display.ruleRationale));
    assert.equal(detailRegion.queryByText(/Evidence:/), null);
    assert.equal(rendered.queryByText("provider disclaimer must not render"), null);
    for (const label of ["GREEN:", "YELLOW:", "RED:"]) assert.ok(rendered.getByText(label));
    assert.equal(detailRegion.queryByText(/value is/i), null);
    assert.ok(rendered.getByRole("img", { name: "5Y transformed indicator history" }));
    assert.ok(rendered.getByLabelText("Value axis in Thousands of jobs")); assert.ok(rendered.getByLabelText("Time axis"));
    fireEvent.click(rendered.getByRole("button", { name: "1Y" })); assert.ok(rendered.getByRole("img", { name: "1Y transformed indicator history" })); assert.match(rendered.getByLabelText("Time axis").textContent, /[A-Z][a-z]{2} \d{2}/);
    fireEvent.click(rendered.getByRole("button", { name: "Max" })); assert.ok(rendered.getByRole("img", { name: "Max transformed indicator history" })); assert.match(rendered.getByLabelText("Time axis").textContent, /2020/);
    fireEvent.click(rendered.getByRole("button", { name: "Back to Library" })); assert.ok(rendered.getByText("Indicator Library"));
    cleanup();
  } finally { await vite.close(); dom.window.close(); Object.assign(globalThis, { window: previous.window, document: previous.document }); Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true }); }
});

test("canonical Detail content does not change with the current signal and empty Data Notes are omitted", async () => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
  const previous = { window: globalThis.window, document: globalThis.document, navigator: globalThis.navigator };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document }); Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const [{ render, cleanup }, { IndicatorDetail }] = await Promise.all([import("@testing-library/react"), vite.ssrLoadModule("/src/features/dashboard/IndicatorDetail.jsx")]);
    const canonicalMetadata = { ...canonicalIndicatorMetadataV1.vix, display: { ...canonicalIndicatorMetadataV1.vix.display, dataNotes: [] } };
    const marketImplication = canonicalMetadata.display.marketImplication;
    const detail = { canonicalMetadata, source: { provider: "FRED", datasetId: "VIXCLS", metadata: {} }, transformation: activeTransformationRegistry.find(entry => entry.id === "vix").transformation, rule: getSignalRule("vix"), history: { points: [] } };
    const rendered = render(React.createElement(IndicatorDetail, { detail, current: { label: "Green", quickInfo: { value: "15", date: "Today", interpretation: "green quick-info" } }, onBack() {} }));
    assert.ok(rendered.getByText(marketImplication)); assert.equal(rendered.queryByText("green quick-info"), null); assert.equal(rendered.queryByRole("heading", { name: "Data Notes" }), null);
    rendered.rerender(React.createElement(IndicatorDetail, { detail, current: { label: "Red", quickInfo: { value: "35", date: "Today", interpretation: "red quick-info" } }, onBack() {} }));
    assert.ok(rendered.getByText(marketImplication)); assert.equal(rendered.queryByText("red quick-info"), null);
    cleanup();
  } finally { await vite.close(); dom.window.close(); Object.assign(globalThis, { window: previous.window, document: previous.document }); Object.defineProperty(globalThis, "navigator", { value: previous.navigator, configurable: true }); }
});
