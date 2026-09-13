import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { createDemoGridConfiguration } from "../src/domain/grid/GridConfiguration.js";

test("Driver.js runs all five steps, persists completion, and restarts from Help", { timeout: 15000 }, async (t) => {
  const dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });

  dom.window.requestAnimationFrame ??= (callback) =>
    dom.window.setTimeout(() => callback(Date.now()), 0);
  dom.window.cancelAnimationFrame ??= (id) => dom.window.clearTimeout(id);
  dom.window.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView ??= () => {};

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Element = dom.window.Element;
  globalThis.Node = dom.window.Node;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
  globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);

  const vite = await createServer({
    configFile: false,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  t.after(async () => {
    await vite.close();
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.navigator;
    delete globalThis.HTMLElement;
    delete globalThis.Element;
    delete globalThis.Node;
    delete globalThis.MutationObserver;
    delete globalThis.getComputedStyle;
    delete globalThis.requestAnimationFrame;
    delete globalThis.cancelAnimationFrame;
  });
  const [{ render, fireEvent, waitFor, cleanup }, { DashboardWorkspace }, { TUTORIAL_COMPLETION_KEY }] =
    await Promise.all([
      import("@testing-library/react"),
      vite.ssrLoadModule("/src/features/dashboard/DashboardWorkspace.jsx"),
      vite.ssrLoadModule("/src/features/dashboard/HelpExperience.jsx"),
    ]);

  const grid = createDemoGridConfiguration();
  const initialSnapshot = {
    grid: grid.toJSON(),
    evaluations: grid.configuredEntryIds.map((entry, index) => ({
      entry,
      observationDate: "2026-09-10",
      signal: { color: index % 2 ? "GREEN" : "YELLOW", transformedValue: index % 2 ? 1 : 0 },
    })),
  };

  const renderDashboard = () =>
    render(
      React.createElement(DashboardWorkspace, {
        initialSnapshot,
        storage: dom.window.localStorage,
        loadEvaluation: async () => null,
        loadDetail: async () => null,
      }),
      { container: document.getElementById("root") },
    );

  const currentTitle = () => document.querySelector(".driver-popover-title")?.textContent;
  const waitForStep = async (title, target, { expectSkip = true } = {}) => {
    await waitFor(() => {
      assert.equal(currentTitle(), title);
      assert.ok(
        document
          .querySelector(`[data-tutorial-target="${target}"]`)
          ?.classList.contains("driver-active-element"),
        `${target} should be Driver's active element`,
      );
    }, { timeout: 4000 });
    if (expectSkip) assert.equal(document.querySelector(".driver-popover-close-btn")?.textContent, "Skip tutorial");
  };
  const clickNext = () => fireEvent.click(document.querySelector(".driver-popover-next-btn"));
  const clickBack = () => fireEvent.click(document.querySelector(".driver-popover-prev-btn"));

  renderDashboard();
  await waitForStep("Build your market view", "grid");

  clickNext();
  await waitForStep("Reorder your grid", "grid");
  assert.equal(document.querySelector(".driver-popover-next-btn")?.disabled, true);
  assert.equal(document.querySelector('[data-tutorial-target="grid"]')?.classList.contains("driver-no-interaction"), false);
  assert.equal(document.querySelector('[aria-label^="Grid position 1:"]')?.getAttribute("draggable"), "true");

  await new Promise((resolve) => setTimeout(resolve, 450));
  clickBack();
  await waitForStep("Build your market view", "grid");

  clickNext();
  await waitForStep("Reorder your grid", "grid");
  await new Promise((resolve) => setTimeout(resolve, 450));
  const firstPosition = document.querySelector('[aria-label^="Grid position 1:"]');
  const secondPosition = document.querySelector('[aria-label^="Grid position 2:"]');
  const dataTransfer = { setData() {}, effectAllowed: "", dropEffect: "" };
  fireEvent.dragStart(firstPosition, { dataTransfer });
  fireEvent.dragOver(secondPosition, { dataTransfer });
  fireEvent.drop(secondPosition, { dataTransfer });
  await waitFor(() => {
    assert.equal(document.querySelector(".driver-popover-next-btn")?.disabled, false);
    assert.equal(document.querySelector(".tutorial-reorder-status")?.textContent, "Grid reordered. You can continue.");
    assert.match(document.querySelector('[aria-label^="Grid position 1:"]')?.textContent ?? "", /U-6 Underemployment/);
  });
  clickNext();
  await waitForStep("Customize and save", "customize-save");
  clickNext();
  await waitForStep("Explore indicator details", "grid");
  assert.equal(document.querySelector(".driver-popover-progress-text")?.textContent, "Step 4 of 5");
  assert.equal(document.querySelector(".driver-popover-next-btn")?.disabled, true);
  assert.match(document.querySelector(".driver-popover-description")?.textContent ?? "", /^Flip any card, then open Details\./);
  assert.equal(document.querySelector('[data-tutorial-target="grid"]')?.classList.contains("driver-no-interaction"), false);

  const tutorialCard = document.querySelector('[data-tutorial-target="quick-info-card"]');
  await new Promise((resolve) => setTimeout(resolve, 450));
  fireEvent.click(tutorialCard);
  await waitFor(() => {
    assert.equal(tutorialCard.getAttribute("aria-pressed"), "true");
    assert.equal(document.querySelector(".tutorial-detail-status")?.textContent, "Card flipped. Open Details to continue.");
    assert.equal(document.querySelector(".driver-popover-next-btn")?.disabled, true);
  });

  fireEvent.click(tutorialCard.querySelector(".card-details"));
  await waitForStep("Explore indicator details", "indicator-detail");
  await waitFor(() => assert.equal(
    document.querySelector(".driver-popover-description")?.textContent,
    "Here you can explore history, signal rules, calculation, and limitations.",
  ));
  assert.equal(document.querySelector(".driver-popover-progress-text")?.textContent, "Step 4 of 5");
  assert.equal(document.querySelector(".driver-popover-next-btn")?.disabled, false);

  clickNext();
  await waitForStep("See the overall market", "market-score", { expectSkip: false });
  assert.equal(document.querySelector(".driver-popover-progress-text")?.textContent, "Step 5 of 5");
  assert.equal(document.querySelector(".driver-popover-next-btn")?.textContent, "Start exploring");
  assert.equal(document.querySelector(".driver-popover-close-btn")?.style.display, "none");

  clickNext();
  await waitFor(() => assert.equal(document.querySelector(".driver-popover"), null), {
    timeout: 4000,
  });
  await waitFor(
    () => assert.equal(dom.window.localStorage.getItem(TUTORIAL_COMPLETION_KEY), "true"),
    { timeout: 4000 },
  );

  fireEvent.click(document.querySelector(".help-trigger"));
  const sourceLink = document.querySelector('.help-drawer a[href="https://github.com/vinacherryhsui/market-timing-dashboard"]');
  assert.equal(sourceLink?.textContent, "View source code");
  assert.equal(sourceLink?.getAttribute("target"), "_blank");
  assert.equal(sourceLink?.getAttribute("rel"), "noreferrer");
  assert.equal(document.querySelector('.help-drawer a[href^="mailto:"]'), null);
  assert.equal(document.querySelector(".help-feedback"), null);
  fireEvent.click(document.querySelector(".restart-tutorial"));
  await waitForStep("Build your market view", "grid");
  assert.equal(tutorialCard.getAttribute("aria-pressed"), "false");
  fireEvent.click(document.querySelector(".driver-popover-close-btn"));
  await waitFor(() => assert.equal(document.querySelector(".driver-popover"), null), {
    timeout: 4000,
  });

  cleanup();
  document.body.innerHTML = '<div id="root"></div>';
  renderDashboard();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(document.querySelector(".driver-popover"), null);

  cleanup();
});
