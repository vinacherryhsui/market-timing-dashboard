# Market Score Engine（Step 5）

Market Score Engine 是純 domain calculation。它只消費使用者目前 3×3 Grid 中已配置 entries 的 evaluated Signals，不取得資料、不執行 transformation、不判斷 SignalRule、不認識 provider，也不呈現 UI。

```text
configured grid entries + evaluated Signals -> MarketScoreEngine -> MarketScoreResult
```

## Input identity and validation

輸入是 0–9 筆 `{ entryId, signal }`。`entryId` 是 source-specific identity，因此下列 entries 可各自存在及計分：

- `cpi_core_cpi:headline`
- `cpi_core_cpi:core`
- `permits_starts:permits`
- `yield_curve_10y3m`
- `yield_curve_10y2y`

同一個精確 `entryId` 不可重複。超過 9 筆、缺少 entryId、未知 signal color 或非 `EQUAL` weighting 均屬 validation error。Stage 5 不支援 CUSTOM 或 MODEL_BASED weighting。

## Numeric mapping and formula

```text
GREEN   = +1
YELLOW  =  0
RED     = -1
UNKNOWN = null（排除）

configuredCount = 已配置 entry 數
validCount      = GREEN / YELLOW / RED 數
unknownCount    = configuredCount - validCount
emptyCount      = 9 - configuredCount
rawScore        = sum(valid signal values)
marketScore     = rawScore / validCount
dataCompleteness = validCount / configuredCount
scoreGranularity = 1 / validCount
```

UNKNOWN 不進入分子或分母，不得當作 YELLOW。它會降低 completeness，但不會稀釋 marketScore，也不會因 completeness 較低而更改 regime。若 `validCount == 0`，`marketScore = null`、`scoreGranularity = null` 且 `regime = UNKNOWN`。若 `configuredCount == 0`，`dataCompleteness = null`；若已配置但全部 UNKNOWN，completeness 為 0。

`scoreGranularity` 是目前有效訊號數所能造成的最小單格分數增量：9、5、3 個有效訊號分別為 `1/9`、`0.20`、`1/3`。它只是診斷分數粗細的 metadata，不參與 marketScore 或 regime 計算。

不設 minimum valid count。只要至少一個 configured entry 有有效 Signal，就可計算；使用者判讀所需的資料完整度由 `validCount` 與 `dataCompleteness` 保留。

Market Score 是所選訊號在 `[-1, +1]` 內的 normalized ordinal／summary aggregation，不是機率、上漲機率或 confidence level。例如 `+0.60` 只代表有效訊號的 normalized summary score 為 0.60，不能表述為「60% bullish probability」。

## Regime defaults

| Condition | Regime |
| --- | --- |
| `marketScore > +0.30` | `BULLISH` |
| `-0.30 <= marketScore <= +0.30` | `NEUTRAL` |
| `marketScore < -0.30` | `BEARISH` |
| `marketScore == null` | `UNKNOWN` |

恰好 `+0.30` 與 `-0.30` 都是 NEUTRAL。`±0.30` 是 `AUTHOR_DEFINED` 的產品／demo defaults，不是官方門檻，也未經 empirical optimization。門檻與規則版本保存在設定中，預設版本為 `1.0.0`。

## Result contract

```js
{
  configuredCount,
  validCount,
  unknownCount,
  emptyCount,
  rawScore,
  marketScore,
  regime,
  dataCompleteness
}
```

本階段不包含 UI、drag-and-drop、author composites、歷史圖表或 scheduling。
