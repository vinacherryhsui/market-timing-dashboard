# Signal Engine Core（Step 3）

本文件定義通用 Signal Engine 的可執行合約。它只把已完成的 transformation 結果套用到結構化規則；不取得原始資料、不計算 transformation、不產生 Market Score，也不包含任何實際 Indicator 的規則。

## Responsibility boundary

處理順序固定為：

```text
RawObservation -> TransformationResult -> SignalEngine -> Signal
```

- transformation 決定「如何算出輸入值」及其歷史資料需求。
- SignalRule 決定「輸入值落在哪個燈號區間」。
- evidenceBasis 說明規則證據來源，不代表資料來源已確認。
- aggregation／Market Score 是後續獨立模組，不屬於 Signal Engine。

## SignalRule contract

```js
{
  ruleId,
  indicatorId,
  sourceRole: null,
  type,
  version,
  status,
  evidenceBasis,
  executableWhenReviewNeeded: false,
  parameters
}
```

支援的 `type`：

- `SIMPLE_RANGE`：單一已轉換數值的三段式範圍。
- `TWO_SIDED_TARGET_BAND`：已由 transformation 算出的目標距離之三段式範圍。
- `ZSCORE_DIRECTIONAL`：已由 transformation 算出的 z-score 之方向性範圍。
- `COMPOUND_CONDITION`：對多個具名 transformation outputs 執行 AND／OR 條件；GREEN 與 RED 均未命中時預設 YELLOW。

前三種規則使用同一個通用 numeric-branch schema。`parameters.input` 指定輸入名稱，`parameters.branches` 必須各有且只有一個 GREEN、YELLOW、RED branch。每個 branch 由 `anyOf`（OR）包住一或多個 `all`（AND）條件群組。條件明確保存 `input`、`operator`，以及固定 `value` 或 `compareToInput`。

支援的比較運算子是 `<`、`<=`、`>`、`>=`、`==`。邊界歸屬由運算子明確決定，Engine 不做四捨五入、容差推定或隱含包含。

`COMPOUND_CONDITION` 的 `parameters` 必須包含 `green`、`red` 及 `defaultColor: "YELLOW"`。若 GREEN 與 RED 同時命中，結果為 `UNKNOWN`，不任意選擇其中一方。

## Evidence and execution status

`evidenceBasis` 支援：

- `OFFICIAL`
- `CONVENTIONAL`
- `EMPIRICAL`
- `AUTHOR_DEFINED`
- `REVIEW_NEEDED`

規則的 `status` 支援 `CONFIRMED` 與 `REVIEW_NEEDED`。`REVIEW_NEEDED` 預設不可執行；只有規格明確設定 `executableWhenReviewNeeded: true` 時才可執行。這項許可是產品決策的明示紀錄，不會把 evidence 改寫成已確認。

## Signal contract

```js
{
  indicatorId,
  sourceRole,
  status,             // EVALUATED | UNKNOWN
  color,              // GREEN | YELLOW | RED | UNKNOWN
  transformedValue,
  evaluatedAt,
  ruleId,
  ruleVersion,
  evidenceBasis,
  reason
}
```

Signal Engine 不輸出 `score`。燈號到分數的映射屬於後續 aggregation layer。

## UNKNOWN policy

下列情況必須回傳 `color: "UNKNOWN"`，不得視為 YELLOW：

- history readiness 明確為未就緒；
- transformation output 是 `null`、`undefined` 或非有限數值；
- compound rule 缺少任一必要具名輸入；
- 規則缺少必要參數、使用不支援的型別／運算子／evidence，或無法安全驗證；
- `REVIEW_NEEDED` 規則未取得明確執行許可；
- compound GREEN 與 RED 同時命中；
- 執行時無法得到唯一、安全的 branch match。

`reason` 必須保留機器可辨識的原因字首，讓未來 detail view 可以解釋缺值或規則問題。

## Validation

規則註冊／執行前的 validation 至少檢查：

- `ruleId`、`indicatorId`、`version` 與必要 parameters；
- 支援的 rule type、operator、status 與 evidence basis；
- rule set 內重複的 `ruleId`；
- numeric branches 是否完整覆蓋數值域、是否重疊、是否存在 gap 或不可能區間；
- compound branches 是否具備有效條件群組與 YELLOW fallback。

靜態 numeric validation 會檢查所有門檻點、相鄰門檻之間及兩端區域。Compound rule 涉及多變數關係，無法完全靜態證明互斥，因此 Engine 仍在執行時防止 GREEN／RED 同時命中。

## Deferred work

本階段刻意不包含實際 Indicator 的 SignalRules、Market Score、作者 composite、UI、圖表、排程或資料取得邏輯。
