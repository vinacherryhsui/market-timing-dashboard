# 九宮格股票市場環境儀表板 Specification v3

> Architecture note (current): Canonical Indicator Metadata v1 is the single source of truth for the 21 active indicators. Its `machine` section owns program-facing source, transformation, and signal configuration; its `display` section owns human-facing UI content. Active registries are derived compatibility views. The older `IndicatorDefinition` examples below are retained as historical product-design context and are not the current metadata onboarding contract. See [`indicator-onboarding.md`](./indicator-onboarding.md) for the authoritative workflow.

## 1. 產品目標

> **This dashboard evaluates stock-market conditions, not the economic business cycle itself.**
>
> **本儀表板評估的是股票市場環境，而不是經濟景氣循環本身。**

九宮格儀表板是一個可自訂的 stock-market regime dashboard。使用者可從 Indicator Library 自由挑選最多 9 個總體經濟或金融指標，拖入 3×3 Grid，查看各指標對目前股票市場環境的解釋性訊號，並取得透明、可追溯的整體判斷。

系統回答的問題是：

> 「根據使用者選擇的指標，目前環境對股票相對偏多、中性，還是偏空？」

系統不回答「經濟目前處於擴張還是衰退」。經濟資料本身看似強勁，不代表股票市場條件必然偏多；例如通膨或貨幣緊縮造成金融條件惡化時，強勁成長可以與轉弱的股票市場並存。因此，每個 Signal 必須解釋該 Observation 對 **equity-market conditions** 的可能含義，而不能只把經濟數據簡化為「好」或「壞」。

產品層不限定固定 9 個指標。任何固定組合最多只是可選 preset，不得成為 Grid 或 Indicator Library 的限制。

Stage 1 是完整核心產品，不是回測產品的前置展示。第一階段仍先使用 mock data 定義與驗證模型，之後依序接入真實資料；React UI 必須等資料來源、transformation、SignalRule 與 Signal Engine 經驗證後才開始。歷史回測不屬於核心產品，也不納入核心 roadmap 或架構需求。

## 2. Stage 1 核心產品功能

最小 Dashboard shell 的 rendering contract 見 [`dashboard-ui.md`](./dashboard-ui.md)：九格 cell 只顯示名稱並以 Signal 控制整格背景色；詳細資料與方法論留給未來 detail view，Market Score summary 不得壓過 Grid 的主要視覺層級。

- 顯示固定 3×3、共 9 個 slot 的 Grid。
- 顯示可擴充的 Indicator Library。
- 使用者可將任意 `gridEligible: true` 的 Indicator 拖入空格。
- 支援 Grid 內移動、交換、取代與移除 Indicator。
- 同一 Indicator 不可在 Grid 重複出現。
- Grid 是快速掃描用的 visual signal matrix；每格最終只顯示 Indicator 名稱，背景色表示 `GREEN`／`YELLOW`／`RED`，`UNKNOWN` 可使用中性灰色。
- 依有效 Signal 計算 normalized `marketScore`。
- 將 `marketScore` 轉換成 `BULLISH`、`NEUTRAL` 或 `BEARISH`。
- 顯示 `validCount`、`unknownCount`、`emptyCount`、`dataCompleteness`、資料時間與指標解釋。
- 詳細數值、歷史、方法、來源與限制不放進最小 Grid，改由未來 Data & Methodology detail view 呈現。
- Indicator Library 可以包含不適合燈號化的有用資料；只有具備可辯護 directional signal 的 Indicator 才能進入 Grid。
- Stage 1 開發初期使用本機 mock data 驗證 domain contract；完成版 Stage 1 必須使用經核實的 real/current data sources。使用者修改仍不做永久保存。

## 3. 使用者操作流程

1. 使用者開啟儀表板，系統載入 mock Indicator Definitions、Observations、Signals 與預設 Grid。
2. 使用者依名稱或 user-facing category 瀏覽 Indicator Library。
3. 使用者將 `gridEligible: true` 的 Indicator 拖至空格，或拖至已有 Indicator 的 slot 進行取代。
4. 使用者可在 Grid 內移動或交換 Indicator，也可將其移除。
5. 系統用 `indicatorId` 查找 Definition、目前 Observation 與其 Signal。
6. 每次 Grid 改變後，系統只聚合 `scoringEligible: true` 且 Signal 有效的項目，計算 normalized Market Score。
7. 系統依產品預設 thresholds 顯示 `BULLISH`、`NEUTRAL` 或 `BEARISH`，並同步顯示資料完整度。
8. 若沒有任何 valid indicator，市場狀態顯示 `UNKNOWN`，並呈現原因。

## 4. 共用列舉與概念

### 4.1 SignalState

```text
GREEN | YELLOW | RED | UNKNOWN
```

### 4.2 SignalMethod

```text
threshold
yoy_momentum
yoy_threshold
rolling_zscore
moving_average
distance_from_target
distance_from_history
```

未來可擴充新 method，但不得在 UI component 中自行實作未登記的方法。

### 4.3 RuleBasis

```text
OFFICIAL | CONVENTIONAL | EMPIRICAL | AUTHOR_DEFINED | REVIEW_NEEDED
```

`ruleBasis` 表示規則或門檻的證據來源，不是計算方法：

- `OFFICIAL`：由指標發布者或明確官方規則提供。
- `CONVENTIONAL`：市場或實務上常見的慣例值。
- `EMPIRICAL`：由歷史資料分析估計。此 enum 可描述規則來源，但不代表核心產品必須提供回測功能。
- `AUTHOR_DEFINED`：由本專案作者設定。
- `REVIEW_NEEDED`：證據來源或合理性尚未完成核實，不得對外描述為已建立的標準。

無法確認來源時不得猜測。`REVIEW_NEEDED` 是明確的方法證據狀態；完全尚未提出候選內容時可使用 `TODO` 作為工作狀態，但 `TODO` 不是 rule-basis 類型。

### 4.4 Category 與 MacroComponent

產品層 user-facing category：

```text
GROWTH | INFLATION | LIQUIDITY_RISK
```

研究來源的第二層 metadata：

```text
C | I | G | NX | MULTI
```

兩者用途不同。UI 可用 Growth、Inflation、Liquidity & Risk 組織 Library；`macroComponent` 保留課堂 C + I + G + NX 的來源分類，不得因 UI 分類而刪除或覆寫。

### 4.5 Direction

MVP 延續原始資料的方向記法：`+1 | -1`。它描述數值變化通常如何映射到 **股票市場條件**：`+1` 表示數值較高或改善通常較偏多；`-1` 表示數值較高或擴大通常較偏空。direction 不是對經濟數據本身做價值判斷，真正燈號邊界仍以 `SignalRule` 為準。

### 4.6 MarketContext

```text
US_EQUITY | TW_EQUITY
```

資料模型應預留市場情境。相同 Indicator 在不同 equity market 下，可以使用不同 explanation，未來也可能使用不同 SignalRule。Stage 1 先綁定單一預設 context，不建立市場切換 UI。

### 4.7 WeightingMode

```text
EQUAL | CUSTOM | MODEL_BASED
```

Stage 1 只實作 `EQUAL`。`CUSTOM` 與 `MODEL_BASED` 僅為保留值，不得實作；不使用 regression weighting 或 Local Projection weighting。

## 5. IndicatorDefinition

`IndicatorDefinition` 描述「指標是什麼、如何計算，以及如何把 Observation 判斷成 Signal」。它不保存某一時間點的實際值。

```js
{
  id: "consumer_confidence",
  name: "消費者信心指數",
  nameEn: "University of Michigan Consumer Sentiment",
  shortName: "消費者信心",
  description: "以五年滾動 z-score 描述消費者信心水準。",
  category: "GROWTH",
  macroComponent: "C",
  frequency: "MONTHLY",
  direction: 1,
  signalRule: {
    method: "rolling_zscore",
    direction: 1,
    transformation: { type: "zscore", input: "level" },
    rollingWindow: { value: 5, unit: "YEAR" },
    targetValue: null,
    thresholds: [
      { id: "green_min", operator: ">", value: 1, basis: "REVIEW_NEEDED" },
      { id: "red_max", operator: "<", value: -1, basis: "REVIEW_NEEDED" }
    ],
    bands: [
      { id: "yellow_band", min: -1, max: 1, includeMin: true, includeMax: true, basis: "REVIEW_NEEDED" }
    ],
    ruleVersion: "1.0.0",
    ruleBasis: "REVIEW_NEEDED",
    notes: []
  },
  dataSource: {
    provider: "TODO",
    seriesId: "TODO",
    url: null,
    releaseLag: "TODO",
    notes: "Mock during domain validation; verified real source required for completed Stage 1"
  },
  marketApplicability: ["US_EQUITY", "TW_EQUITY"],
  contextOverrides: {
    US_EQUITY: {
      explanation: "此訊號對美股市場環境的解釋。",
      signalRule: null
    },
    TW_EQUITY: {
      explanation: "此訊號對台股市場環境的解釋。",
      signalRule: null
    }
  },
  scoringEligible: true,
  gridEligible: true,
  indicatorKind: "SOURCE_INDICATOR",
  ruleVersion: "1.0.0",
  notes: []
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string | 穩定且唯一的識別碼 |
| `name` | string | 中文名稱 |
| `nameEn` | string | 英文名稱 |
| `shortName` | string | Grid 使用的短名稱 |
| `description` | string | 使用者可讀的定義與用途 |
| `category` | Category | 產品層分類 |
| `macroComponent` | MacroComponent \| null | 課堂來源分類 |
| `frequency` | string | `DAILY`、`WEEKLY`、`MONTHLY`、`QUARTERLY` 等；未知為 `TODO` |
| `direction` | `1` \| `-1` | 指標方向 |
| `signalRule` | SignalRule | Observation 轉換成 Signal 的規則 |
| `dataSource` | DataSourceMetadata | 資料來源 metadata 或來源設定 reference；初期可用 mock，完成版 Stage 1 連接已核實的 real/current source。複合指標必須能關聯多筆來源設定，不可把多條 series 壓成一筆假來源 |
| `marketApplicability` | MarketContext[] | 指標可用來解釋的股票市場情境 |
| `contextOverrides` | object | 各市場的 explanation 與可選 SignalRule override；Stage 1 不提供切換 UI |
| `scoringEligible` | boolean \| `REVIEW_NEEDED` | 是否可進入分數聚合 |
| `gridEligible` | boolean \| `REVIEW_NEEDED` | 是否已有可辯護的 directional Signal、可放入九宮格；不得只因資料有經濟意義就設為 `true` |
| `indicatorKind` | `SOURCE_INDICATOR` \| `AUTHOR_COMPOSITE` | 區分來源型指標與作者定義的複合指標 |
| `ruleVersion` | string | Definition 目前採用的規則版本 |
| `notes` | string[] | 限制、疑問與研究備註 |

`ruleVersion` 在 Definition 表示目前綁定版本；`signalRule.ruleVersion` 表示規則物件版本，兩者在 MVP 應一致。

### 5.1 Signal Indicator 與 Context Indicator

- Signal Indicator：已具備可辯護 directional signal 時，才可設定 `gridEligible: true`；是否參與聚合另由 `scoringEligible` 表示。
- Context Indicator：可以在 Library 或 detail view 展示，但在沒有可辯護 Signal 前必須為 `gridEligible: false`，不得為了填滿 Grid 強迫轉成紅黃綠。
- 尚未決定者：規格文件可標 `REVIEW_NEEDED`；實作前必須解析為明確 boolean。

`gridEligible` 與 `scoringEligible` 不可互相代替：前者控制是否能進入 visual signal matrix，後者控制是否進入未來聚合。Demo 可以暫時排除尚無合理 directional representation 的 Indicator，待方法成熟後再重新納入。

### 5.2 Author Composite Indicator

作者定義的 composite indicator 是核心產品能力，不是研究層的臨時特例。Definition 使用 `indicatorKind: "AUTHOR_COMPOSITE"`，並應保留 component indicator references、composite methodology version、資料完整度與限制等結構化欄位；本階段不定義或實作公式、權重及缺值合成政策。

完成的 author composite 最終必須產生可追溯、grid-compatible 的 directional Signal，才能設為 `gridEligible: true`。只有資料組合但無法合理解釋為股票市場 `GREEN`／`YELLOW`／`RED` 的 composite，不得放入 Grid。

## 6. IndicatorObservation

`IndicatorObservation` 描述「某個時間點實際觀察到什麼值」。Definition 與 Observation 必須分離，才能保留時間序列、修訂狀態與計算輸入。

```js
{
  id: "consumer_confidence:2026-07-31",
  indicatorId: "consumer_confidence",
  observedAt: "2026-07-31",
  availableAt: "2026-08-15T10:00:00+08:00",
  value: 101.2,
  unit: "index",
  transformedValues: { zscore: 1.18 },
  previousValue: 99.8,
  status: "VALID",
  revision: "INITIAL",
  sourceRef: "mock:consumer_confidence:2026-07",
  metadata: {}
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string | Observation 唯一識別碼 |
| `indicatorId` | string | 對應 IndicatorDefinition |
| `observedAt` | ISO 8601 date/datetime | 觀察期間或時點 |
| `availableAt` | ISO 8601 datetime \| null | 該值實際可使用的時間；MVP 可為 mock 值 |
| `value` | number \| null | 原始觀察值 |
| `unit` | string \| null | 原始值單位 |
| `transformedValues` | object | YoY、z-score、移動平均、距離等衍生值 |
| `previousValue` | number \| null | 判斷加速或放緩時的可比前值 |
| `status` | `VALID` \| `MISSING` \| `INVALID` | Observation 品質狀態 |
| `revision` | string \| null | 初值、修訂值等 metadata |
| `sourceRef` | string \| null | mock record 或未來來源紀錄 |
| `metadata` | object | 方法特定的補充資料 |

`displayValue` 屬於 presentation formatting，不是 Observation 的核心欄位，應由產品層依 `value` 與 `unit` 產生。

### 6.1 RawObservation 與資料來源設定

Provider adapter 的輸出必須先正規化為共用 `RawObservation` contract，再交給 transformation。Provider 特有欄位只能存在 acquisition config、adapter 內部或 `metadata`，不得滲入 transformation、Signal Engine、Market Score 或 UI 的分支判斷。

```js
{
  provider: "FRED",
  datasetId: "CPIAUCSL",
  indicatorId: "cpi_core_cpi",
  observationDate: "2026-07-01",
  value: 332.813,
  unit: "Index 1982-1984=100",
  frequency: "Monthly",
  retrievedAt: "2026-09-02T10:00:00.000Z",
  status: "VALID",
  metadata: { role: "headline" }
}
```

資料來源設定與 observation 必須分離。來源設定至少能提供下列結構化欄位，或提供可解析到 authoritative data-source record 的 reference：

| 欄位 | 用途 |
| --- | --- |
| `provider` | 資料供應者 |
| `datasetId` | series／dataset ID |
| `indicatorId` | 所屬 IndicatorDefinition |
| `role` | 複合指標中的角色，例如 `headline`／`core` |
| `sourceMeaning` | 官方 series 的意義，不是股票市場解讀 |
| `endpoint`／`sourceUrl` | 官方取得位置 |
| `frequency` | 原始發布頻率 |
| `unit` | 原始單位 |
| `seasonalAdjustment` | 季節調整狀態；未知時明確標示 |
| `revisionCharacteristics` | 初值、修訂、benchmark revision 等特性 |
| `acquisitionNotes` | provider-specific 取得與解析注意事項 |

最新觀察日期與 raw value 屬於目前 `RawObservation`，不得複製成靜態 Definition 文案。Active source identity、acquisition config 與人類可讀來源內容以 Canonical Indicator Metadata v1 為 authoritative definition；`docs/data-sources.md` 保留來源研究與 catalogue reference。

### 6.2 TransformationDefinition

Transformation methodology 必須是可追溯的結構化 domain metadata，不得只存在於函式名稱、註解或 UI 文案。每個 transformation 至少預留：

```js
{
  type: "ROLLING_ZSCORE",
  frequency: "MONTHLY",
  window: 36,
  lag: null,
  requiredPeriods: 36,
  outputUnit: "ZSCORE",
  version: "1.0.0",
  parameters: { standardDeviation: "POPULATION" }
}
```

`window`、`lag`、`requiredPeriods` 與 `parameters` 應能表達前期值、歷史 window 及 method-specific 依賴。這裡只定義資料需求與計算方法；GREEN／YELLOW／RED 邊界仍只屬於 `SignalRule`。

目前支援的結構類型為 `PASSTHROUGH`、`MONTHLY_DIFFERENCE`、`YOY_PERCENT_CHANGE`、`ROLLING_ZSCORE` 與 `LEVEL_PLUS_PERIOD_CHANGE_AND_TRAILING_MEDIAN`。完整欄位、active source-role mapping 與 required-period derivation 以 [`docs/transformations.md`](./transformations.md) 為準。

`requiredPeriods` 是從 current observation 向後所需的 recent contiguous periods，不是全資料集任意位置的 observation 總數。Step 2 依此 metadata 請求有限 lookback，並執行日期連續性、缺期與必要 frequency normalization；它不改變 raw acquisition contract。

Step 2 的 cache-first history preparation、continuity rules、limited API lookback 與 frequency normalization 已定義於 [`docs/history-preparation.md`](./history-preparation.md)。準備結果使用結構化 `HistoryReadinessResult`；`ready: false` 不得導致補值、縮短 window 或 signal assignment。

Structural continuity 只作診斷；transformation readiness 必須依 transformation-specific mathematical requirements 判斷，包括 required anchors、minimum valid observations 與 allowed missing periods。不得使用單一「所有 periods 都必須 valid」規則套用所有 transformation。

Transformation definitions 不含 direction 或 signal thresholds。這些內容即使已有候選，也不因 transformation 確認而自動成為 `CONFIRMED`。

Transformation、direction 與 threshold／band 是三個獨立的方法決策，必須分別記錄內容、evidence basis 與確認狀態。可使用下列概念欄位：

```js
methodologyStatus: {
  transformation: "CONFIRMED",
  direction: "REVIEW_NEEDED",
  thresholds: "REVIEW_NEEDED"
}
```

一項 transformation 可以先完成，而 direction 或 threshold 仍為 `REVIEW_NEEDED`；不得因公式可計算就推定燈號門檻已獲支持。Signal rule 不可採用沒有來源、理由或明確 `AUTHOR_DEFINED` 標示的任意 threshold。

### 6.3 PERIODIC_FILE 歷史 cache

部分研究型指標以官方 downloadable file 提供，而不是 live API。這類來源使用 `acquisitionMode: "PERIODIC_FILE"`，只透過明確的手動同步命令更新，不可在 dashboard load 時下載，也不建立 cron、scheduler、背景 polling 或自動刷新。

每份 cache 保存 dataset identity、provider、official source、frequency、unit、`retrievedAt`、attribution／license／revision metadata，以及完整可用的 monthly observations。current-data path 從 cache 的最新 `VALID` observation 產生共用 `RawObservation`；下游不需知道原始檔是 XLS、XLSX 或 CSV。

`observationDate` 是資料代表的經濟期間；`retrievedAt`／`lastSyncedAt` 是本產品取得官方檔案的時間。兩者不得混用。未來 freshness read model 可同時呈現兩者，但在沒有 provider 明文規則時不得自行發明 stale cutoff。

同步必須採安全替換：下載、schema validation 與完整解析成功後才更新 cache。任一來源失敗時保留先前成功 cache、回報精確錯誤並繼續同步其他來源。不得因失敗先清空或覆寫舊資料。

產品可以保存歷史 observations，供未來 descriptive historical chart／analysis 使用；本階段不建立該 UI。這些 cache **不代表 point-in-time dashboard state**，也不支援真實歷史回測，因為 publication lag、後續 revisions、vintage data 與 look-ahead bias 尚未建模。不得由目前完整修訂後序列宣稱可重現過去當時可知的訊號。

## 7. SignalRule

Step 3 的可執行 Signal Engine 合約以 [`signal-engine.md`](./signal-engine.md) 為準。核心規則必須消費 `TransformationResult`，不得自行取得資料或重算 transformation。支援的通用 rule types 為 `SIMPLE_RANGE`、`TWO_SIDED_TARGET_BAND`、`ZSCORE_DIRECTIONAL`、`COMPOUND_CONDITION`；所有比較邊界均以明確運算子表示。下方既有欄位與範例屬於指標方法論描述模型，不得解讀為已實作的特定指標規則。

Active canonical definitions、精確 executable thresholds、evidence qualifications、版本與 inactive entries 的說明見 [`signal-rules.md`](./signal-rules.md)。衍生 registry 僅是 engine compatibility view。規則的 `CONFIRMED` status 僅表示結構有效且允許執行，不代表門檻是官方標準或經學術最佳化。

`SignalRule` 描述如何將 Observation 與必要歷史資料轉成 Signal。規則由 domain 層執行，不得散落或寫死在 React component。

```js
{
  method: "moving_average",
  direction: 1,
  transformation: { type: "distance_ratio", input: "price", reference: "moving_average" },
  threshold: null,
  thresholds: [
    { id: "ma_reference", value: 0, unit: "ratio", basis: "CONVENTIONAL", note: "待核實來源" }
  ],
  bands: [
    {
      id: "yellow_buffer",
      min: -0.02,
      max: 0.02,
      includeMin: true,
      includeMax: true,
      basis: "AUTHOR_DEFINED",
      note: "200DMA 周圍 ±2% buffer"
    }
  ],
  rollingWindow: { value: 200, unit: "TRADING_DAY" },
  targetValue: null,
  ruleVersion: "1.0.0",
  ruleBasis: "CONVENTIONAL",
  notes: []
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `method` | SignalMethod | 計算與判斷方法 |
| `direction` | `1` \| `-1` | 高值／變化與燈號的方向關係 |
| `threshold` | Threshold \| null | 單一門檻的簡化形式 |
| `thresholds` | Threshold[] | 多個具名門檻；每個可有自己的 basis |
| `bands` | Band[] | 一或多個區間；每個可有自己的 basis |
| `rollingWindow` | Window \| null | 例如 5 年、200 個交易日 |
| `targetValue` | number \| null | 距離目標法的 anchor |
| `transformation` | object \| null | YoY、z-score、絕對距離、移動平均差等 |
| `ruleVersion` | string | 規則版本，建議使用語意化版本 |
| `ruleBasis` | RuleBasis \| `REVIEW_NEEDED` | 整體規則主要來源 |
| `notes` | string[] | 重疊、例外、待核實事項 |

Threshold／Band 至少包含 `id`、數值或上下界、邊界是否包含、`basis` 與可選 `note`。各 threshold/band 的 `basis` 優先於規則層摘要，因此可表達「官方基準點 + 作者自訂黃燈 buffer」，不可退化成單一 `author_defined` boolean。

同一 Indicator 未來可有多個 rule variant；MVP 是否允許使用者切換尚未決定。若尚未開放，Definition 只綁定一個 active rule。

## 8. Signal

Step 3 核心輸出欄位為 `indicatorId`、`sourceRole`、`status`、`color`、`transformedValue`、`evaluatedAt`、`ruleId`、`ruleVersion`、`evidenceBasis`、`reason`。其中 `status` 為 `EVALUATED | UNKNOWN`，`color` 為 `GREEN | YELLOW | RED | UNKNOWN`。Signal Engine 不產生 `score`；既有的顏色到分數映射留給未來 aggregation layer。完整 UNKNOWN 與 validation 規則見 [`signal-engine.md`](./signal-engine.md)。

`Signal` 是特定 Observation 在特定股票市場情境下，套用特定版本 SignalRule 後的結果。

```js
{
  id: "consumer_confidence:2026-07-31:rule-1.0.0",
  indicatorId: "consumer_confidence",
  observationId: "consumer_confidence:2026-07-31",
  marketContext: "US_EQUITY",
  state: "GREEN",
  score: 1,
  reason: "5-year rolling z-score 1.18 > 1；依目前規則，此環境對股票相對偏多",
  evaluatedAt: "2026-08-15T10:00:00+08:00",
  ruleVersion: "1.0.0",
  inputs: { zscore: 1.18 }
}
```

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | string | Signal 唯一識別碼 |
| `indicatorId` | string | 對應 IndicatorDefinition |
| `observationId` | string | 被判斷的 Observation |
| `marketContext` | MarketContext | 此 Signal 所評估的股票市場情境 |
| `state` | SignalState | 四種正式狀態之一 |
| `score` | `1` \| `0` \| `-1` \| `null` | `UNKNOWN` 必須為 `null` |
| `reason` | string | 使用者可理解的判斷原因 |
| `evaluatedAt` | ISO 8601 datetime | 計算時間 |
| `ruleVersion` | string | 實際使用的規則版本 |
| `inputs` | object | 關鍵衍生值，供追溯 |

固定映射：`GREEN = +1`、`YELLOW = 0`、`RED = -1`、`UNKNOWN = null（不計分）`。

## 8.1 Data & Methodology 詳情需求

每個 Indicator 最終必須能產生使用者可讀的「Data & Methodology」詳情。此詳情是由 domain objects 與目前資料組合出的 **read model**，不是另一份獨立維護的 methodology 文案。

詳情至少包含：

1. **Data source**：provider、series／dataset ID、source meaning、frequency、unit、seasonal adjustment、revision characteristics，以及目前 RawObservation 的 latest observation date。
2. **Data collection**：官方 endpoint／source、目前使用的 raw value，以及 provider-specific acquisition notes。
3. **Transformation／calculation**：TransformationDefinition 的 method、formula、rolling window、required historical inputs 與實際 transformation inputs／outputs（存在時）。
4. **Signal methodology**：SignalRule 的 GREEN／YELLOW／RED 規則、thresholds／bands、每個門檻的 rule basis，以及實際 rule version。
5. **Equity-market interpretation**：IndicatorDefinition 的 market-context explanation，說明為何結果可能對股票市場偏多、中性或偏空；不得退化為經濟數據本身的「好／壞」。
6. **Limitations／caveats**：IndicatorDefinition、DataSourceMetadata、TransformationDefinition 與 SignalRule 中相關的限制、資料落後、修訂風險、方法假設及未決事項。

組合來源如下：

| 詳情區塊 | Authoritative domain source |
| --- | --- |
| 指標名稱、定義、股票市場解讀、一般限制 | `IndicatorDefinition` |
| Provider、dataset、來源意義、頻率、單位、季調、修訂、endpoint、取得備註 | data-source config／`DataSourceMetadata` |
| 最新日期、raw value、取得時間、資料狀態 | current `RawObservation` |
| 公式、window、所需歷史輸入、計算版本 | `TransformationDefinition` 與 transformation result |
| 燈號邊界、basis、rule version | active `SignalRule` 與 current `Signal` |

實作約束：

- UI 只能 render 組合後的 read model，不得硬編 provider、公式、threshold、解釋或 caveat。
- 同一 indicator 有多條 raw series 時，Data source 與 Data collection 必須逐條呈現其 `role`，不得暗示已完成合成。
- 缺少或仍待確認的 metadata 必須顯示為 unavailable／`REVIEW_NEEDED`，不得由 UI 猜測。
- Provider adapter 只負責 acquisition 與 raw normalization；它不負責股票市場解讀、transformation 說明或 signal methodology。
- Detail read model 的建立不得改變現有 acquisition contract，也不得要求 Signal Engine 或 Grid 知道 provider-specific schema。

## 9. Grid

Step 6 的可執行 domain contract 以 [`grid-configuration.md`](./grid-configuration.md) 為準。

Grid 固定包含 9 個 slot，位置 `0` 到 `8` 由左至右、由上至下排列。slot 只儲存 source-specific `entryId`；這取代早期只存 parent `indicatorId` 的設計，以支援 headline/core 等獨立 active entries。

Grid 的唯一職責是快速呈現最多 9 個 directional signals。Cell presentation contract 為「Indicator 名稱 + Signal 背景色」；數值、日期、圖表、來源、公式與 caveats 均不塞入 cell。使用者未來可新增、取代與重新排列 Indicator。

```js
{
  id: "default-grid",
  name: "預設九宮格",
  slots: [
    { position: 0, entryId: "consumer_confidence" },
    { position: 1, entryId: null },
    { position: 2, entryId: null },
    { position: 3, entryId: null },
    { position: 4, entryId: null },
    { position: 5, entryId: null },
    { position: 6, entryId: null },
    { position: 7, entryId: null },
    { position: 8, entryId: null }
  ]
}
```

約束：

- `slots` 永遠包含 9 個項目。
- `position` 唯一且介於 `0` 到 `8`。
- `entryId` 可為 `null`，代表空格。
- 非空 ID 必須存在於 active executable SignalRule registry。
- 同一個精確 `entryId` 不可在 Grid 重複；不同 source roles 是不同 entries。
- Grid 不複製 Definition、Observation、Signal 或規則內容。
- `UNKNOWN` cell 可使用中性灰色；灰色只代表目前無法形成有效 Signal，不等同 `YELLOW`。

## 10. Market Score 與市場狀態

Step 5 的可執行 Market Score contract 以 [`market-score.md`](./market-score.md) 為準。引擎只計算使用者 Grid 目前配置的 0–9 個 source-specific entries，不會自動納入全部 active SignalRules；不設 minimum valid count，且 `UNKNOWN` 永遠排除於分子與分母之外。此純 domain engine 不取得資料、不執行 transformation 或 SignalRule，也不認識 provider 或 UI。

Market Score 是 normalized summary score，不是機率或 confidence level。`scoreGranularity = 1 / validCount`（無有效訊號時為 `null`）只描述目前分數的離散粗細；data completeness、score 與 regime 必須各自保留，低 completeness 不得自行改變 regime。

Step 5 的 executable contract 與 validation 以 [`market-score.md`](./market-score.md) 為準。Market Score 只使用目前 Grid 已配置的 0–9 個 source-specific entries，不自動計算全部 active indicators；不設 minimum valid count，且同一 parent indicator 的不同 source roles 不會被合併。

只有 `scoringEligible: true` 且 Signal 為 `GREEN`、`YELLOW` 或 `RED` 的已配置項目才是 valid indicator。Stage 1 使用 equal weight。

```text
GREEN = +1
YELLOW = 0
RED = -1
UNKNOWN = 不計分

N = validCount
rawScore = sum(valid signal scores)
marketScore = rawScore / N
-1 <= marketScore <= +1
```

空格、Context Indicator 與 `UNKNOWN` 都不進入 `rawScore`，也不進入分母 `N`。只要 `N > 0`，依下列產品預設門檻判斷：

| Market Score | Market regime | 顯示語意 |
| --- | --- | --- |
| `marketScore > +0.30` | `BULLISH` | 股票市場環境相對偏多 |
| `-0.30 <= marketScore <= +0.30` | `NEUTRAL` | 股票市場環境相對中性 |
| `marketScore < -0.30` | `BEARISH` | 股票市場環境相對偏空 |

`±0.30` 是可設定的 **PRODUCT DEFAULTS**，不是學術上成立或經實證最佳化的最優切點。規格與未來實作必須保留 aggregation rule version 與 configurable threshold metadata，不能宣稱其具有學術最佳性。

聚合結果：

```text
configuredCount = Grid 中 indicatorId 非 null 的 Indicator 數量
validCount = 可計分且 Signal 為 GREEN / YELLOW / RED 的數量
unknownCount = 可計分但 Signal 為 UNKNOWN 的數量
emptyCount = 空 slot 數量
dataCompleteness = validCount / configuredCount
```

若 `configuredCount = 0`，`dataCompleteness` 顯示為 `null`／N/A，不做除以零。若 `validCount = 0`，`marketScore` 與 market regime 都為 `UNKNOWN`。`configuredCount` 一律計算所有非空 slot；若未來允許 Context Indicator 放入 Grid，它也屬於 configured indicator，但不會增加 `validCount`。

Aggregation 設定至少包含：

```js
{
  weightingMode: "EQUAL",
  bullishThreshold: 0.30,
  bearishThreshold: -0.30,
  ruleBasis: "AUTHOR_DEFINED",
  ruleVersion: "1.0.0",
  notes: ["Product defaults; not empirically optimized"]
}
```

## 11. UNKNOWN 處理

Observation 缺值／無效、transformation 歷史不足、SignalRule 不完整或邊界衝突、variant 未選定、mock 明確標記未知時，均可產生 `UNKNOWN`。

- `UNKNOWN.score` 必須為 `null`，不可用 0 代替。
- `UNKNOWN` 不可視為 `YELLOW`，也不加入總分。
- UI 未來應使用獨立樣式並顯示 `reason`。
- 空格不算 `UNKNOWN`。
- Context Indicator 不算 `unknownCount`，因為它本來不具計分資格。
- `UNKNOWN` 不進入 `rawScore` 或 `marketScore` 的分母。
- 若 `validCount = 0`，`marketScore` 與 market regime 為 `UNKNOWN`。

## 12. Stage 1 不做的功能

- 不在 domain-validation 階段立即串接資料 API；但完成版 Stage 1 會實作並使用經核實的 real/current data acquisition。
- 不建立登入、帳號、權限、資料庫或雲端同步。
- 不永久保存使用者 Grid 配置。
- 不做歷史回測，也不以未來回測需求主導資料模型或核心 roadmap。
- 不做參數最佳化，不宣稱 `±0.30` 是 empirically optimal。
- 不選定固定 9 指標；固定組合最多只是可選 preset。
- 不提供自動下單、券商串接、投資建議、通知或排程更新。
- 不讓使用者在 MVP UI 編輯公式、threshold、band 或權重。
- 不保證 MVP 開放 rule variant 或市場 context 切換。
- 不實作 `CUSTOM`、`MODEL_BASED`、regression weighting 或 Local Projection weighting。
- 本階段不建立 React UI；本文件只定義可實作的 domain contract。

## 13. 待決策事項

- 各 Indicator 的 `gridEligible` 審查，以及尚無可辯護 directional representation 者何時重新納入 demo。
- Author composite 的 component schema、公式、權重、缺值政策與版本規格。
- 多 rule variant 的儲存方式與 MVP 是否提供切換。
- Stage 1 的預設 `MarketContext`，以及 context-specific explanation／rule override 的解析順序。
- `frequency`、`transformation`、Threshold 與 Band 的最終實作型別與序列化格式。
- Active Indicator Library 已確認為 18 個；排除項目的決策紀錄保留於 `docs/indicator-library.md`。

## 14. 實作優先順序

1. 定義並整理 Indicator Library。
2. 核實每個 Indicator 的 data source。
3. 定義 data transformations。
4. 定義且版本化 SignalRules，確保其解釋的是 equity-market implications。
5. 實作 data acquisition。
6. 實作 Signal Engine 與 equal-weight aggregation。
7. 使用真實指標驗證 acquisition、transformation、Signal 與 Market Score。
8. 完成以上驗證後，才建立 dashboard UI。

歷史回測不在此順序或核心 roadmap 中。即使不做回測，仍須維持 data acquisition、transformations、signal rules、aggregation 與 UI 的清楚分離。
