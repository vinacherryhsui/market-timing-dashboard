import React, { useEffect, useRef, useState } from "react";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { helpLinks } from "./helpConfig.js";

export const TUTORIAL_COMPLETION_KEY = "market-timing-dashboard:tutorial-complete:v2";

const TUTORIAL_STEPS = Object.freeze([
  Object.freeze({ element: '[data-tutorial-target="grid"]', popover: { title: "Build your market view", description: "Choose up to 9 indicators to build your own market view.", side: "top", align: "center", progressText: "Step 1 of 5" } }),
  Object.freeze({ element: '[data-tutorial-target="grid"]', disableActiveInteraction: false, popover: { title: "Reorder your grid", description: "Drag any indicator card to a different position.", side: "top", align: "center", progressText: "Step 2 of 5", disableButtons: ["next"] } }),
  Object.freeze({ element: '[data-tutorial-target="customize-save"]', popover: { title: "Customize and save", description: "Add, replace, or remove indicators, then save your own layout for later.", side: "bottom", align: "start", progressText: "Step 3 of 5" } }),
  Object.freeze({
    element: '[data-tutorial-target="grid"]',
    disableActiveInteraction: false,
    popover: {
      title: "Explore indicator details",
      description: "Flip any card, then open Details.",
      side: "right",
      align: "center",
      progressText: "Step 4 of 5",
      disableButtons: ["next"],
    },
  }),
  Object.freeze({
    element: '[data-tutorial-target="indicator-detail"]',
    waitForElement: 1500,
    popover: {
      title: "Explore indicator details",
      description: "Here you can explore history, signal rules, calculation, and limitations.",
      side: "right",
      align: "center",
      progressText: "Step 4 of 5",
    },
  }),
  Object.freeze({ element: '[data-tutorial-target="market-score"]', popover: { title: "See the overall market", description: "Valid indicator signals are combined into the overall market environment: Bullish, Neutral, or Bearish.", side: "left", align: "center", progressText: "Step 5 of 5", showButtons: ["previous", "next"] } }),
]);

function tutorialIsComplete(storage) {
  try { return storage?.getItem(TUTORIAL_COMPLETION_KEY) === "true"; } catch { return false; }
}

function saveTutorialCompletion(storage) {
  try { storage?.setItem(TUTORIAL_COMPLETION_KEY, "true"); } catch { /* The tutorial can still close without storage. */ }
}

function HelpDrawer({ onClose, onStartTutorial }) {
  const closeButtonRef = useRef(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return <>
    <button className="help-drawer-backdrop" type="button" aria-label="Close Help / About" onClick={onClose} />
    <aside className="help-drawer" role="dialog" aria-modal="true" aria-labelledby="help-drawer-title">
      <header>
        <div><p className="eyebrow">Dashboard guide</p><h2 id="help-drawer-title">Help / About</h2></div>
        <button ref={closeButtonRef} className="help-close" type="button" onClick={onClose} aria-label="Close Help / About">×</button>
      </header>
      <div className="help-drawer-content">
        <section><h3>About</h3><p>A customizable stock-market environment dashboard that brings macroeconomic, financial, and risk indicators into one market view.</p><p>Choose the indicators that matter to you, arrange your own grid, and use their current signals to understand the broader equity-market environment.</p></section>
        <section><h3>Tutorial</h3><p>New here? Take a quick tour of the dashboard and its main features.</p><button className="restart-tutorial" type="button" onClick={onStartTutorial}>Restart tutorial</button></section>
        <section><h3>Project</h3><p>This dashboard was built as a research and portfolio project.</p></section>
      </div>
      {helpLinks.sourceCodeUrl && <footer>
        {helpLinks.sourceCodeUrl && <a href={helpLinks.sourceCodeUrl} target="_blank" rel="noreferrer">View source code</a>}
      </footer>}
    </aside>
  </>;
}

function updateReorderPopover(tour, complete) {
  if (!tour?.isActive() || tour.getActiveIndex() !== 1) return;
  const popover = tour.getState("popover");
  if (!popover) return;
  popover.nextButton.disabled = !complete;
  popover.nextButton.classList.toggle("driver-popover-btn-disabled", !complete);
  let status = popover.description.querySelector(".tutorial-reorder-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "tutorial-reorder-status";
    status.setAttribute("role", "status");
    popover.description.append(status);
  }
  status.textContent = complete ? "Grid reordered. You can continue." : "Complete one reorder to enable Next.";
  status.classList.toggle("is-complete", complete);
}

function updateDetailActionPopover(tour, flipped, detailOpened) {
  if (!tour?.isActive() || tour.getActiveIndex() !== 3) return;
  const popover = tour.getState("popover");
  if (!popover) return;
  const complete = flipped && detailOpened;
  popover.nextButton.disabled = !complete;
  popover.nextButton.classList.toggle("driver-popover-btn-disabled", !complete);
  let status = popover.description.querySelector(".tutorial-detail-status");
  if (!status) {
    status = document.createElement("span");
    status.className = "tutorial-detail-status";
    status.setAttribute("role", "status");
    popover.description.append(status);
  }
  status.textContent = complete
    ? "Indicator Detail opened."
    : flipped
      ? "Card flipped. Open Details to continue."
      : "Flip a card to begin.";
  status.classList.toggle("is-complete", complete);
}

export function HelpExperience({ storage = globalThis.localStorage, reorderRevision = 0, cardFlipActivity = {}, detailOpenActivity = {}, onTutorialStart }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tutorialRun, setTutorialRun] = useState(() => tutorialIsComplete(storage) ? 0 : 1);
  const tourRef = useRef(null);
  const reorderRevisionRef = useRef(reorderRevision);
  const reorderBaselineRef = useRef(reorderRevision);
  const reorderCompleteRef = useRef(false);
  const cardFlipRevisionRef = useRef(cardFlipActivity.revision ?? 0);
  const detailOpenRevisionRef = useRef(detailOpenActivity.revision ?? 0);
  const cardFlipBaselineRef = useRef(cardFlipActivity.revision ?? 0);
  const detailOpenBaselineRef = useRef(detailOpenActivity.revision ?? 0);
  const flippedEntryIdRef = useRef(null);
  const cardFlipCompleteRef = useRef(false);
  const detailOpenCompleteRef = useRef(false);
  reorderRevisionRef.current = reorderRevision;
  cardFlipRevisionRef.current = cardFlipActivity.revision ?? 0;
  detailOpenRevisionRef.current = detailOpenActivity.revision ?? 0;
  const startTutorial = () => { setDrawerOpen(false); setTutorialRun((value) => value + 1); };

  useEffect(() => {
    const tour = tourRef.current;
    if (!tour?.isActive() || tour.getActiveIndex() !== 1 || reorderCompleteRef.current) return;
    if (reorderRevision === reorderBaselineRef.current) return;
    reorderCompleteRef.current = true;
    updateReorderPopover(tour, true);
  }, [reorderRevision]);

  useEffect(() => {
    const tour = tourRef.current;
    if (!tour?.isActive() || tour.getActiveIndex() !== 3 || cardFlipCompleteRef.current) return;
    if ((cardFlipActivity.revision ?? 0) === cardFlipBaselineRef.current) return;
    cardFlipCompleteRef.current = true;
    flippedEntryIdRef.current = cardFlipActivity.entryId;
    updateDetailActionPopover(tour, true, false);
  }, [cardFlipActivity.entryId, cardFlipActivity.revision]);

  useEffect(() => {
    const tour = tourRef.current;
    if (!tour?.isActive() || tour.getActiveIndex() !== 3 || detailOpenCompleteRef.current) return;
    if (!cardFlipCompleteRef.current || (detailOpenActivity.revision ?? 0) === detailOpenBaselineRef.current) return;
    if (detailOpenActivity.entryId !== flippedEntryIdRef.current) return;
    detailOpenCompleteRef.current = true;
    updateDetailActionPopover(tour, true, true);
    tour.moveNext();
  }, [detailOpenActivity.entryId, detailOpenActivity.revision]);

  useEffect(() => {
    if (!tutorialRun || typeof globalThis.window?.requestAnimationFrame !== "function") return undefined;
    reorderBaselineRef.current = reorderRevisionRef.current;
    reorderCompleteRef.current = false;
    cardFlipBaselineRef.current = cardFlipRevisionRef.current;
    detailOpenBaselineRef.current = detailOpenRevisionRef.current;
    flippedEntryIdRef.current = null;
    cardFlipCompleteRef.current = false;
    detailOpenCompleteRef.current = false;
    const steps = TUTORIAL_STEPS.map((step, index) => {
      if (index === 1) return {
        ...step,
        onHighlighted: (_element, _step, { driver: activeTour }) => {
          if (!reorderCompleteRef.current) reorderBaselineRef.current = reorderRevisionRef.current;
          updateReorderPopover(activeTour, reorderCompleteRef.current);
        },
        popover: {
          ...step.popover,
          onNextClick: (_element, _step, { driver: activeTour }) => {
            if (reorderCompleteRef.current) activeTour.moveNext();
          },
        },
      };
      if (index === 3) return {
        ...step,
        onHighlighted: (_element, _step, { driver: activeTour }) => {
          if (!detailOpenCompleteRef.current) {
            cardFlipBaselineRef.current = cardFlipRevisionRef.current;
            detailOpenBaselineRef.current = detailOpenRevisionRef.current;
            flippedEntryIdRef.current = null;
            cardFlipCompleteRef.current = false;
          }
          updateDetailActionPopover(activeTour, cardFlipCompleteRef.current, detailOpenCompleteRef.current);
        },
        popover: {
          ...step.popover,
          onNextClick: (_element, _step, { driver: activeTour }) => {
            if (cardFlipCompleteRef.current && detailOpenCompleteRef.current) activeTour.moveNext();
          },
        },
      };
      return step;
    });
    const tour = driver({
      steps,
      animate: true,
      smoothScroll: true,
      allowClose: true,
      allowScroll: true,
      overlayClickBehavior: "close",
      disableActiveInteraction: true,
      stagePadding: 7,
      stageRadius: 2,
      overlayColor: "#17201b",
      overlayOpacity: 0.5,
      popoverOffset: 18,
      popoverClass: "dashboard-tour-popover",
      showButtons: ["previous", "next", "close"],
      showProgress: true,
      progressText: "Step {{current}} of {{total}}",
      prevBtnText: "Back",
      nextBtnText: "Next",
      doneBtnText: "Start exploring",
      onPopoverRender: (popover, { index }) => {
        if (index !== TUTORIAL_STEPS.length - 1) {
          popover.closeButton.textContent = "Skip tutorial";
          popover.closeButton.setAttribute("aria-label", "Skip tutorial");
          popover.footerButtons.prepend(popover.closeButton);
        }
        if (index === 1) updateReorderPopover(tourRef.current, reorderCompleteRef.current);
        if (index === 3) updateDetailActionPopover(tourRef.current, cardFlipCompleteRef.current, detailOpenCompleteRef.current);
      },
      onDestroyStarted: (_element, _step, { driver: activeTour }) => {
        saveTutorialCompletion(storage);
        activeTour.destroy();
      },
    });
    tourRef.current = tour;
    onTutorialStart?.();
    const startFrame = window.requestAnimationFrame(() => tour.drive());
    return () => {
      window.cancelAnimationFrame(startFrame);
      if (tour.isActive()) tour.destroy();
      if (tourRef.current === tour) tourRef.current = null;
    };
  }, [onTutorialStart, storage, tutorialRun]);

  return <>
    <button className="help-trigger" type="button" onClick={() => setDrawerOpen(true)}>Help / About</button>
    {drawerOpen && <HelpDrawer onClose={() => setDrawerOpen(false)} onStartTutorial={startTutorial} />}
  </>;
}
