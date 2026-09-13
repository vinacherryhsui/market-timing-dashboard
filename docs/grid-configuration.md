# Grid Configuration Domain（Step 6）

Grid Configuration 表示使用者目前的 3×3 signal matrix 配置。它只保存哪個 active executable signal entry 位於哪個實體位置；不保存 IndicatorDefinition、Observation、Signal、Market Score 或 provider 資訊，也不執行 acquisition、transformation、SignalRule 或 UI rendering。

## Model

```js
{
  version: 1,
  slots: [
    { position: 0, entryId: "nonfarm_payrolls" },
    { position: 1, entryId: null },
    // positions 2–8
  ]
}
```

- 永遠有 9 個 ordered slots，位置固定為整數 `0..8`。
- `entryId: null` 代表空格；移除項目不壓縮其他位置。
- 非空 `entryId` 必須存在於 active executable SignalRule registry。
- Grid 使用 source-specific entry identity，不以 parent indicatorId 合併。因此 `cpi_core_cpi:headline` 與 `cpi_core_cpi:core`、兩條 yield curve 均可同時存在。
- 同一個精確 entryId 不可重複。

## Operations

- `addIndicator(entryId)`：加入第一個空格；重複、inactive 或滿格時拒絕。
- `removeIndicator(position)`：只清除指定位置，不重排其他 slots。
- `replaceIndicator(position, entryId)`：取代指定位置；同位置同 entry 是 no-op，若 entry 已在其他位置則拒絕。
- `moveIndicator(fromPosition, toPosition)`：目標為空時搬移；目標有值時交換；來源為空時拒絕。
- `getConfiguredEntries()`：依實體位置回傳非空 `{position, entryId}`。
- `configuredEntryIds`：依實體位置回傳非空 entry IDs，供未來 Signal lookup 與 Market Score input 組裝使用。

所有 operation 都會驗證 position、ID 格式、active eligibility、duplicate 與九格容量。Domain error 保留穩定 error code，不靜默修正不合法配置。

## Serialization and persistence

`toJSON()` 回傳 versioned plain JSON；`GridConfiguration.fromJSON()` 會重新驗證 slot 數量、position、entryId、active status 與 duplicates。未知版本或不合法 saved state 直接拒絕。

`GridConfigurationStore` 定義 `load()`、`save()`、`clear()` boundary。Step 6 提供 `InMemoryGridConfigurationStore` 作為測試及未來 browser persistence 的簡單 contract reference；沒有實作 localStorage、account、backend 或 database。Store 以 serialized snapshot 保存，避免後續修改原物件時連帶改變已保存狀態。

## Demo preset

Demo factory 依序建立：

1. `nonfarm_payrolls`
2. `sahm_rule`
3. `vix`
4. `yield_curve_10y3m`
5. `pce_price_index`
6. `gscpi`
7. `global_gpr`
8. `trade_policy_uncertainty`
9. `household_debt_service_ratio`

這只是可完全替換的初始展示配置，不是推薦、最適組合或固定產品限制。

## Downstream boundary

```text
GridConfiguration.configuredEntryIds
  -> resolve evaluated Signals
  -> MarketScoreEngine
```

Grid 不計算 Signal 或 Market Score。Step 6 不包含 UI、drag-and-drop rendering 或持久化基礎設施。
