import React, { useRef, useState } from "react";
import { formatMarketScore } from "./dashboardViewModel.js";
import { SignalCard } from "./SignalCard.js";

export function Dashboard({ viewModel, library = null, layoutControls = null, helpExperience = null, replaceNotice = null, replaceMode = false, onCardActivate, onCardFlip, onRemove, onMove, onDetails, tutorialResetRevision = 0 }) {
  const { cells, marketScore } = viewModel;
  const [dragFrom, setDragFrom] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [suppressedEntryId, setSuppressedEntryId] = useState(null);
  const dragFromRef = useRef(null);
  const clearDrag = () => {
    dragFromRef.current = null;
    setDragFrom(null);
    setDropTarget(null);
  };
  const finishDrag = () => {
    clearDrag();
    setTimeout(() => setSuppressedEntryId(null), 0);
  };
  const startDrag = (event, cell) => {
    if (replaceMode || cell.entryId === null) return event.preventDefault();
    event.dataTransfer?.setData("text/plain", String(cell.position));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    dragFromRef.current = cell.position;
    setDragFrom(cell.position);
    setSuppressedEntryId(cell.entryId);
  };
  const drop = (event, cell) => {
    const fromPosition = dragFromRef.current;
    if (replaceMode || fromPosition === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    if (fromPosition !== cell.position) onMove?.(fromPosition, cell.position);
    finishDrag();
  };
  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div><p className="eyebrow">Equity market regime</p><h1>Market Timing Dashboard</h1></div>
        {helpExperience}
      </header>
      {layoutControls}

      <section className="dashboard-layout" aria-label="Market timing dashboard">
        {replaceNotice}
        <div className="signal-grid" aria-label="3 by 3 market signal grid" data-tutorial-target="grid">
          {cells.map((cell) => (
            <div
              className={`signal-card-wrap${dragFrom === cell.position ? " is-dragging" : ""}${dropTarget === cell.position ? " is-drop-target" : ""}`}
              key={cell.position}
              draggable={cell.entryId !== null && !replaceMode}
              onDragStart={(event) => startDrag(event, cell)}
              onDragEnd={finishDrag}
              onDragOver={(event) => {
                if (!replaceMode && dragFromRef.current !== null) {
                  event.preventDefault();
                  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
                  setDropTarget(cell.position);
                }
              }}
              onDragLeave={() => { if (dropTarget === cell.position) setDropTarget(null); }}
              onDrop={(event) => drop(event, cell)}
              aria-label={`Grid position ${cell.position + 1}${cell.entryId ? `: ${cell.name}` : ": empty drop target"}`}
            >
              <SignalCard
                key={cell.entryId ?? `empty-${cell.position}`}
                cell={cell}
                replaceMode={replaceMode}
                onActivate={onCardActivate}
                dragEnabled={cell.entryId !== null && !replaceMode}
                suppressActivation={cell.entryId === suppressedEntryId}
                onDetails={onDetails}
                onFlip={onCardFlip}
                tutorialResetRevision={tutorialResetRevision}
                tutorialTarget={cell.entryId && cell.position === cells.find((item) => item.entryId)?.position}
              />
              {cell.entryId !== null && onRemove && <button type="button" className="remove-card" onClick={() => onRemove(cell.position)} aria-label={`Remove ${cell.name}`}>×</button>}
            </div>
          ))}
        </div>

        <aside className="market-summary" aria-label="Market score summary" data-tutorial-target="market-score">
          <div>
            <span className="summary-label">Market Environment</span>
            <strong className={`regime regime-${marketScore.regime.toLowerCase()}`}>{marketScore.regime}</strong>
          </div>
          <dl>
            <div><dt><span className="market-score-label">Market Score</span><details className="market-score-help"><summary aria-label="About Market Score">?</summary><div className="market-score-help-content"><strong className="market-score-help-title">How Market Score works</strong><p className="market-score-points">Green = +1 · Yellow = 0 · Red = −1</p><p>The Market Score is the average of all valid indicator signals.<br />Unknown signals are excluded.</p><p className="market-score-regimes">Bullish: above +0.30<br />Neutral: −0.30 to +0.30<br />Bearish: below −0.30</p></div></details></dt><dd>{formatMarketScore(marketScore.marketScore)}</dd></div>
            <div><dt>Coverage</dt><dd>{marketScore.validCount} / {marketScore.configuredCount}</dd></div>
          </dl>
        </aside>
      </section>
      {library}
    </main>
  );
}
