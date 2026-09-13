import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GridConfiguration, createDemoGridConfiguration } from "../../domain/grid/GridConfiguration.js";
import { Dashboard } from "./Dashboard.jsx";
import { DashboardController, fetchEntryEvaluation, fetchIndicatorDetail } from "./DashboardController.js";
import { IndicatorLibrary } from "./IndicatorLibrary.jsx";
import { LayoutControls } from "./LayoutControls.jsx";
import { WorkspaceLayoutStore } from "./WorkspaceLayoutStore.js";
import { IndicatorDetail } from "./IndicatorDetail.jsx";
import { HelpExperience } from "./HelpExperience.jsx";

export function DashboardWorkspace({ initialSnapshot, loadEvaluation = fetchEntryEvaluation, loadDetail = fetchIndicatorDetail, storage = globalThis.localStorage }) {
  const layoutStoreRef = useRef(null);
  if (!layoutStoreRef.current) layoutStoreRef.current = new WorkspaceLayoutStore(storage);
  const layoutStore = layoutStoreRef.current;
  const controllerRef = useRef(null);
  if (!controllerRef.current) {
    const restoredGrid = layoutStore.loadCurrent();
    const invalidStoredWorkspace = !restoredGrid && layoutStore.hasCurrentValue();
    const initialGrid = restoredGrid ?? (invalidStoredWorkspace ? createDemoGridConfiguration() : GridConfiguration.fromJSON(initialSnapshot.grid));
    if (invalidStoredWorkspace) layoutStore.saveCurrent(initialGrid);
    controllerRef.current = new DashboardController({ grid: initialGrid, evaluations: initialSnapshot.evaluations, loadEvaluation });
  }
  const controller = controllerRef.current;
  const [revision, setRevision] = useState(0);
  const [replaceEntryId, setReplaceEntryId] = useState(null);
  const [pendingEntryId, setPendingEntryId] = useState(null);
  const [layouts, setLayouts] = useState(() => layoutStore.listLayouts());
  const [selectedLayoutId, setSelectedLayoutId] = useState("");
  const [detailEntryId, setDetailEntryId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reorderRevision, setReorderRevision] = useState(0);
  const [cardFlipActivity, setCardFlipActivity] = useState({ revision: 0, entryId: null });
  const [detailOpenActivity, setDetailOpenActivity] = useState({ revision: 0, entryId: null });
  const [tutorialResetRevision, setTutorialResetRevision] = useState(0);
  const resetCardsForTutorial = useCallback(() => setTutorialResetRevision((value) => value + 1), []);
  const viewModel = useMemo(() => controller.viewModel, [controller, revision]);
  const refresh = () => setRevision((value) => value + 1);
  const persistGridChange = () => {
    layoutStore.saveCurrent(controller.grid);
    setSelectedLayoutId("");
    refresh();
  };

  useEffect(() => {
    const missing = controller.grid.configuredEntryIds.filter((entryId) => !controller.evaluations.has(entryId));
    if (!missing.length) return undefined;
    let active = true;
    Promise.all(missing.map((entryId) => controller.load(entryId))).then(() => { if (active) refresh(); });
    return () => { active = false; };
  }, [controller]);

  const selectLibraryEntry = async (entryId) => {
    if (!controller.grid.slots.some((slot) => slot.entryId === null)) return setReplaceEntryId(entryId);
    setPendingEntryId(entryId);
    const operation = controller.addIndicator(entryId);
    persistGridChange();
    await operation;
    setPendingEntryId(null);
    refresh();
  };
  const activateCard = async (position) => {
    if (!replaceEntryId) return;
    setPendingEntryId(replaceEntryId);
    const operation = controller.replaceIndicator(position, replaceEntryId);
    persistGridChange();
    await operation;
    setPendingEntryId(null);
    setReplaceEntryId(null);
    refresh();
  };
  const removeCard = (position) => { const removed = controller.removeIndicator(position); if (removed === detailEntryId) { setDetailEntryId(null); setDetail(null); } setReplaceEntryId(null); persistGridChange(); };
  const moveCard = (fromPosition, toPosition) => { controller.moveIndicator(fromPosition, toPosition); persistGridChange(); setReorderRevision((value) => value + 1); };
  const recordCardFlip = (entryId, flipped) => { if (flipped) setCardFlipActivity((value) => ({ revision: value.revision + 1, entryId })); };

  const switchLayout = async (id) => {
    if (!id) return setSelectedLayoutId("");
    const grid = layoutStore.loadLayout(id);
    if (!grid) return;
    controller.setGrid(grid);
    layoutStore.saveCurrent(grid);
    setReplaceEntryId(null);
    setSelectedLayoutId(id);
    refresh();
    await Promise.all(grid.configuredEntryIds.map((entryId) => controller.load(entryId)));
    refresh();
  };
  const saveLayout = (name) => {
    const saved = layoutStore.saveAs(name, controller.grid);
    setLayouts(layoutStore.listLayouts());
    setSelectedLayoutId(saved.id);
  };
  const deleteLayout = (id) => {
    layoutStore.deleteLayout(id);
    setLayouts(layoutStore.listLayouts());
    setSelectedLayoutId("");
  };
  const resetGrid = async () => {
    const grid = createDemoGridConfiguration();
    controller.setGrid(grid);
    layoutStore.saveCurrent(grid);
    setReplaceEntryId(null);
    setSelectedLayoutId("");
    refresh();
    await Promise.all(grid.configuredEntryIds.filter((entryId) => !controller.evaluations.has(entryId)).map((entryId) => controller.load(entryId)));
    refresh();
  };

  const replaceNotice = replaceEntryId ? <div className="replace-notice" role="status"><span>Select a grid cell to replace.</span><button type="button" onClick={() => setReplaceEntryId(null)}>Cancel</button></div> : null;
  const openDetails = async entryId => { setDetailEntryId(entryId); setDetail(null); setDetailOpenActivity((value) => ({ revision: value.revision + 1, entryId })); try { setDetail(await loadDetail(entryId)); } catch { setDetail(null); } };
  const currentDetailCell = viewModel.cells.find(cell => cell.entryId === detailEntryId);
  const library = detailEntryId ? <IndicatorDetail detail={detail} current={currentDetailCell} onBack={() => { setDetailEntryId(null); setDetail(null); }} /> : <IndicatorLibrary selectedEntryIds={controller.grid.configuredEntryIds} onSelect={selectLibraryEntry} pendingEntryId={pendingEntryId} />;
  const layoutControls = <LayoutControls layouts={layouts} selectedLayoutId={selectedLayoutId} onSelect={switchLayout} onSaveAs={saveLayout} onDelete={deleteLayout} onReset={resetGrid} />;
  return <Dashboard viewModel={viewModel} library={library} layoutControls={layoutControls} helpExperience={<HelpExperience storage={storage} reorderRevision={reorderRevision} cardFlipActivity={cardFlipActivity} detailOpenActivity={detailOpenActivity} onTutorialStart={resetCardsForTutorial} />} replaceNotice={replaceNotice} replaceMode={Boolean(replaceEntryId)} onCardActivate={activateCard} onCardFlip={recordCardFlip} onRemove={removeCard} onMove={moveCard} onDetails={openDetails} tutorialResetRevision={tutorialResetRevision} />;
}
