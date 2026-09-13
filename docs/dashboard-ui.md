# Minimal Dashboard Shell（UI Step 1）

Dashboard 是股票市場環境的快速視覺 signal matrix。本階段以 React + Vite 呈現既有 default `GridConfiguration`，資料流程保持為：

```text
Default GridConfiguration
  -> configuredEntryIds
  -> SignalEvaluationService
  -> Signals
  -> MarketScoreEngine
  -> dashboard view model
  -> React rendering
```

Vite 本機 Node middleware 提供 `/api/dashboard`，呼叫現有 history、transformation、SignalRule 與 Market Score domain logic。瀏覽器端不重複金融計算、provider selection 或 signal threshold。

## Grid presentation

- 固定呈現 3×3 九格。
- 每格可見內容只有中央 metadata 提供的人類可讀 indicator name。
- 整格背景直接反映 Signal：GREEN／YELLOW／RED；UNKNOWN 使用中性灰色。
- raw value、transformed value、observation date、來源、方法及 score contribution 不放在 cell；它們保留給未來 detail view。
- 每格以 `aria-label` 同時表達 indicator name 與 Signal color，避免只能依賴視覺顏色判讀。

## Flip-card quick information

Quick information uses the 21-entry Canonical Indicator Metadata registry as its source of stable user-facing value and interpretation semantics. `indicatorPresentationRegistry` is a derived compatibility selector. The unchanged transformed result, computed signal, matched `SignalRule` branch, source configuration, and observation frequency remain the factual inputs. JSX only renders the resulting read model.

Presentation definitions do not contain independent threshold values: threshold wording is populated from the matched rule branch. Rolling z-scores pair a relative-position value with a short indicator-specific implication, while compound results retain both level and direction. Observation periods are rendered as a human-readable calendar date for daily series, month name and year for monthly series, and quarter and year for quarterly series without changing the stored date.

The generic rule-aware formatter remains a second-level safety fallback after the indicator-specific definition. The unavailable message is reserved for missing transformation/rule support or an inconsistent valid signal that cannot be reconciled with its recorded rule branch. `UNKNOWN` uses an explicit unavailable state instead of implying a directional interpretation.

UI Step 2A adds a local flip state to each configured card. Clicking or keyboard-activating a card switches only that card between:

- Front: the existing indicator name only; its Signal continues to control the full background color.
- Back: current transformed value, latest observation date, provider/dataset reference, and a short interpretation sourced from centralized read-model metadata.

Clicking the same card again restores the front. The back does not print an explicit `Signal: GREEN/YELLOW/RED` label. Methodology copy is not embedded in JSX; formatting and short interpretations come from Canonical Indicator Metadata, while value/date/source come from the current evaluation result and source configuration. The Indicator Detail view presents canonical methodology and descriptive transformed history.

## Market summary

Grid 旁顯示 compact summary：Market Environment、格式化至約兩位小數的 Market Score，以及 `validCount / configuredCount`。Market Score 是 normalized summary score，不是機率、confidence 或 expected return；其視覺層級低於 signal grid。

UNKNOWN entry 仍留在 Grid 並呈現灰色，Market Score domain 會排除它；completeness 與 regime 分開顯示及計算。

## Loading and failure

初次請求期間顯示 loading message。Endpoint failure 顯示不含 provider 紅读錯誤細節的可恢復提示；若個別 evaluation 安全回傳 UNKNOWN，整體 dashboard 仍正常呈現。

## Scope

## Indicator Library and grid editing (UI Step 2B)

- The Library exposes the 21 active executable signal entries, grouped by user-facing theme and labelled from centralized indicator metadata. Entries already configured in the grid are visibly selected and cannot be added twice.
- `GridConfiguration` remains the sole authority for grid membership, order, uniqueness, and empty slots. The UI does not maintain a second selected-indicator list.
- Selecting an unconfigured Library entry adds it to the first empty grid slot. Only that entry is then evaluated, and the existing Market Score view model is rebuilt without a page reload.
- When all nine slots are occupied, selecting an unconfigured entry starts an explicit replacement mode. The user must choose a grid cell or cancel; choosing a cell replaces that slot and exits replacement mode.
- In replacement mode, a card activation replaces the selected slot and does not flip the card. Outside replacement mode, card activation retains the quick-information flip behavior from Step 2A.
- A subtle per-card remove control clears that slot while preserving its position as a hole. Later additions continue to use the first empty slot.
- Acquisition or evaluation failure keeps the selected entry configured with an `UNKNOWN` signal so coverage and score exclusion continue to follow the domain rules.

## Grid drag-and-drop reordering

- Only occupied grid cards are draggable. Library entries, empty slots, the Market Score summary, and other controls are not drag sources.
- Every grid position remains a drop target. Dropping on an occupied position swaps exactly those two positions; dropping on an empty position moves the card and leaves its source position empty. The grid never compacts or performs list-style insertion.
- React passes only the source and target positions to `GridConfiguration.moveIndicator(fromPosition, toPosition)`. That domain method remains authoritative for move and swap behavior; the UI does not mutate slots or implement a second reorder algorithm.
- Reordering reuses existing evaluations and rebuilds the view model without requesting signal evaluation, so Market Score and coverage remain unchanged.
- A completed drag briefly suppresses card activation, preventing the drop gesture from flipping the card. Ordinary clicks still use the original card-local flip state and 3D transition. Reordered cards remount by entry identity so flip state cannot leak from one indicator to another.
- Replace mode disables card dragging so selecting a replacement position retains priority. Remove, add, and replace behaviors otherwise remain unchanged.
- The stable `.signal-card-wrap` is the native drag source and drop target. Its child `.signal-cell` is a focusable `div[role=button]` dedicated to flip activation, while `.card-inner` owns the background, border, and both 3D faces. Native drag state dims the wrapper and outlines the current drop target. Enter and Space retain the keyboard-accessible quick-info action; native HTML drag-and-drop itself does not provide keyboard reordering in this step.

UI Step 1 不包含 Indicator Library、drag-and-drop、add／replace 操作、detail view、methodology page、歷史圖表、localStorage、author composites 或 scheduling。
