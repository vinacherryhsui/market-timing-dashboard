# History Preparation Specification — Step 2

## Scope

History preparation 將 active source-specific transformation entry 轉成可供純 transformation 使用的 recent normalized observations。本步不執行 SignalRule、不產生 GREEN／YELLOW／RED、不計算 Market Score，也不涉及 UI、author composites、歷史圖表或排程。

```text
transformation registry entry
→ resolve source config and provider adapter
→ derive requiredPeriods
→ inspect cache
→ fetch limited API history only when needed
→ normalize frequency only when explicitly configured
→ calculate structural continuity diagnostics
→ evaluate transformation-specific mathematical sufficiency
→ HistoryReadinessResult
```

## HistoryReadinessResult

```js
{
  ready,
  latestObservationDate,
  contiguousStartDate,
  contiguousPeriods,
  requiredPeriods,
  readinessPolicy,
  requiredValidObservations,
  validObservations,
  allowedMissingPeriods,
  missingPeriods,
  requiredAnchorPeriods,
  missingRequiredAnchors,
  frequency,
  preparedObservations,
  reason,
  error,
  retrievedAt,
  cacheStatus,
  fetched
}
```

`ready: false` 時不得縮短 window、補值或產生 signal。`preparedObservations` 保存 policy window 中實際存在的 observations；缺值保持缺值，不建立 forward-fill、backward-fill、interpolation 或替代資料。

## Cache-first behavior

- API source 先讀 `data/cache/history/` 中與 `indicatorId + datasetId` 對應的 raw history cache。
- Cache 符合 transformation-specific sufficiency，且 `retrievedAt` 在通用 operational cache TTL 內時直接重用。
- TTL 只判斷本機抓取是否近期，不代表 provider observation 是否經濟上 fresh，也不取代 `observationDate`。
- Cache 不足或 operationally stale 時，adapter 取得 `requiredPeriods + safetyBuffer` 所需範圍；目前 safety buffer 預設 3 periods。
- 只有 provider fetch 完整成功後才安全替換 cache。失敗時回傳 `ready: false`、保留舊 cache 並附上精確 error。
- 不建立資料庫。

Periodic-file sources（`global_gpr`、`global_epu`、`trade_policy_uncertainty`、`gscpi`）只讀 `data/cache/research/` 的完整歷史檔，不在 prepare flow 下載。更新仍只由 `npm run sync:research-data` 手動執行。

## Structural continuity 與 transformation sufficiency

> **Recent continuity is diagnostic, but transformation readiness is determined by transformation-specific mathematical requirements.**

Continuity 保留作資料品質診斷，不再作為所有 transformations 的共同 ready gate。一個 series 可以有 intermediate missing period，但只要符合該 transformation 的 anchors、minimum valid count 與 allowed missing policy，仍可為 ready。

- Monthly：從 latest observation 往回必須是連續 calendar months。
- Quarterly：從 latest observation 往回必須是連續 calendar quarters。
- Daily passthrough：只要求 latest valid observation；不要求週末與假日的 calendar-day continuity。
- 目前沒有需要 normalized daily rolling history 的 active transformation；若未來新增，必須另訂交易日 continuity。
- 診斷依 recent period keys，不依全資料集 observation count。是否 ready 則依下列 method-specific policy。

| Transformation | Sufficiency policy |
| --- | --- |
| `PASSTHROUGH` | 至少一筆 latest valid observation |
| `MONTHLY_DIFFERENCE` | current `t` 與前月 `t-1` 都必須 valid |
| `YOY_PERCENT_CHANGE` | current `t` 與 matching `t-12` 必須 valid；中間月份不影響 readiness |
| `ROLLING_ZSCORE`（36 months） | 固定 36-calendar-month window；latest 必須 valid；至少 35 valid，最多 1 missing |
| `LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN` | 固定 20-quarter window；`t` 與 `t-4` 必須 valid；至少 19 valid，最多 1 missing |

Rolling z-score 與 trailing median 只使用 window 內 valid observations 計算，不替換 missing value。

`observationDate` 是資料代表的期間；`retrievedAt`／`lastSyncedAt` 是取得或同步時間，兩者不得互換。

## Frequency normalization

Frequency normalization 由 provider-agnostic utility 執行，只在 TransformationDefinition 明確要求時啟用。

`credit_spread_baa10y`：

```text
BAA10Y valid daily observations
→ group by calendar month
→ arithmetic mean of valid daily values
→ monthly RawObservation-like observations dated YYYY-MM-01
→ fixed 36-calendar-month window: latest valid, at least 35 valid, at most 1 missing
→ Step 3/4 rolling z-score
```

不使用 month-end value。空值 daily rows 不進入 mean；整月沒有 valid daily value 時該月份不存在，continuity validation 會回報缺月。

VIX、T10YIE、T10Y2Y 與 T10Y3M 仍為 daily passthrough，不會自動套用 monthly mean。

## Acquisition interface

Provider adapter 可實作 `getHistory(sourceConfig, historyRequirement)`，把 generic requirement 翻譯成 provider query。FRED 對一般 monthly／quarterly／daily passthrough 使用有限 `limit`；daily-to-monthly request 使用所需月份加 safety buffer 推導 `observation_start`。FredClient 不含 indicator-specific branches。

DGBAS compatible XML 透過既有 selector config 解析歷史 observations。ResearchFileAdapter 的 `getHistory` 只讀 cache。所有回傳 observation 維持共用 RawObservation 欄位，不暴露 provider payload。

## Current live readiness note

2026-09-06 驗證時，`underemployment/U6RATE`、`cpi_core_cpi:headline/CPIAUCSL` 與 `cpi_core_cpi:core/CPILFESL` 的 relevant window 內，FRED 對 `2025-10` 回傳缺值。Step 2.5 後三者均為 `ready: true`：U6 在 36-month window 有 35 筆 valid；兩條 CPI 的 `t` 與 `t-12` anchors 均 valid。缺值仍原樣保存，structural contiguous count 仍顯示中斷，沒有補值或替代月份。這是同步時點的診斷結果，不是永久資料規則。

本步不根據 readiness 指派任何 Signal。
