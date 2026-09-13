# Active indicator onboarding

An active indicator has exactly one definition in `canonicalIndicatorMetadataV1`. Transformation, signal, source, grid, and UI compatibility views are derived from that definition. Do not add the same active definition to another registry.

## Field checklist

### Machine fields

| Field | Classification | Rule |
| --- | --- | --- |
| `machine.entryId` | REQUIRED | Stable active-entry key. Use `indicatorId` when there is no role, otherwise `indicatorId:role`. |
| `machine.identity.indicatorId` | REQUIRED | Stable indicator identity. |
| `machine.identity.role` | OPTIONAL | Omit or use `null` unless multiple source roles share an indicator identity. |
| `machine.source.providerId` | REQUIRED | Supported provider machine ID. |
| `machine.source.datasetId` | REQUIRED | Provider dataset or series ID. |
| `machine.source.rawFrequency` | REQUIRED | Explicit machine frequency. |
| `machine.source.rawUnit` | REQUIRED | Explicit machine unit. |
| `machine.source.acquisition` | REQUIRED | Use `{}` when the provider needs no per-series configuration. Provider-only keys are listed below. |
| `machine.transformation.type` | REQUIRED | Existing `TransformationType`; do not introduce calculation logic in metadata. |
| `machine.transformation.evaluationFrequency` | REQUIRED | Frequency at which the transformation is evaluated. |
| `machine.transformation.requiredPeriods` | REQUIRED | Must agree with the transformation definition. |
| `machine.transformation.outputUnit` | REQUIRED | Machine output unit. |
| `machine.transformation.version` | REQUIRED | Transformation definition version. |
| `machine.transformation.lag` | OPTIONAL | `null` when the transformation has no lag. |
| `machine.transformation.window` | OPTIONAL | `null` when the transformation has no window. |
| `machine.transformation.parameters` | REQUIRED | Use `{}` when the transformation needs no parameters. |
| `machine.signal.type` | REQUIRED | Existing `SignalRuleType`. |
| `machine.signal.parameters` | REQUIRED | Exact executable branches, operators, and thresholds. |
| `machine.signal.evidenceBasis` | REQUIRED | Machine evidence classification used by rule validation. |
| `machine.signal.status` | REQUIRED | Executability/review status. |
| `machine.signal.version` | REQUIRED | Signal definition version. |
| `machine.signal.methodology` | REQUIRED | Use `{}` when no runtime formatter or validation metadata is needed. |

Do not store `ruleId`, `sourceRole`, transformation `frequency`, or source `provider` aliases. Compatibility selectors safely derive them from `entryId`, identity, `evaluationFrequency`, and `providerId`.

### Human-facing fields

| Field | Classification | Rule |
| --- | --- | --- |
| `display.name` | REQUIRED | Product display name. |
| `display.theme` | REQUIRED | Existing library/dashboard grouping label. |
| `display.sentenceSubject` | REQUIRED | Natural-language subject for explanatory copy. |
| `display.providerLabel` | REQUIRED | Human-readable provider name. |
| `display.frequencyLabel` | REQUIRED | Human-readable frequency. |
| `display.transformationLabel` | REQUIRED | Short calculation label. |
| `display.calculationDescription` | REQUIRED | Concise calculation explanation. |
| `display.ruleRationale` | REQUIRED | Human explanation of why the signal bands are used. |
| `display.marketImplication` | REQUIRED | Indicator-specific market interpretation. |
| `display.limitations` | REQUIRED | Indicator-specific methodological limitation. |
| `display.dataNotes` | OPTIONAL | Structured notes; omit it or use `[]` when none are useful. |
| `display.quickInfo` | REQUIRED | Existing SignalCard presentation contract: `valueStyle`, `interpretationStyle`, `subject`, and `wording`. |

Each data note is `{ type, label, text }`. Supported types are `source`, `calculation`, `release_timing`, `revision`, `coverage`, `licensing`, and `other`.

### Provider-specific acquisition fields

- FRED: no per-series fields are required; use `{}`. Optional provider metadata may be included only when the acquisition result must preserve it.
- DGBAS: `endpoint`, `selector`, and `selector.frequencyCode` are required. Keep any dataset-specific selector keys used by the DGBAS client.
- `CALDARA_IACOVIELLO`, `POLICY_UNCERTAINTY`, and `NY_FED`: require `acquisitionMode: "PERIODIC_FILE"`, `endpoint`, `format`, `sheet`, `valueColumn`, and either `dateColumn` or both `yearColumn` and `monthColumn`. Preserve provider-specific metadata used for provenance or synchronization.
- Catalogue-only providers such as EIA remain in `catalogueOnlyIndicatorSources` until an indicator becomes active. When activated, its client-required configuration must move into its canonical definition and validation must be extended for that provider.

## Onboarding sequence

1. Choose `indicatorId`, optional `role`, and the resulting `entryId`.
2. Add provider, dataset, raw frequency/unit, and only the acquisition fields that provider requires.
3. Select an existing transformation and record its exact engine parameters.
4. Add the exact executable signal rule without changing thresholds or operators during migration.
5. Add the human display, calculation, rationale, implication, limitation, and quick-info copy.
6. Add useful structured data notes, or `[]`.
7. Run `validateIndicatorOnboardingDefinition(definition)` and fix every reported field path.
8. Add the definition to `canonicalIndicatorMetadataV1`, then run canonical coverage, parity tests, the full suite, and the production build.

## Copyable definition template

```js
const exampleIndicator = Object.freeze({
  machine: Object.freeze({
    entryId: "example_indicator", // or "example_indicator:role"
    identity: Object.freeze({
      indicatorId: "example_indicator",
      role: null,
    }),
    source: Object.freeze({
      providerId: "FRED",
      datasetId: "EXAMPLE_SERIES",
      rawFrequency: "MONTHLY",
      rawUnit: "INDEX",
      acquisition: Object.freeze({}),
    }),
    transformation: Object.freeze({
      type: TransformationType.PASSTHROUGH,
      evaluationFrequency: TransformationFrequency.MONTHLY,
      requiredPeriods: 1,
      outputUnit: "SOURCE_UNIT",
      lag: null,
      window: null,
      parameters: Object.freeze({}),
      version: "1.0.0",
    }),
    signal: Object.freeze({
      type: SignalRuleType.SIMPLE_RANGE,
      parameters: Object.freeze({
        input: "value",
        branches: [/* exact GREEN, YELLOW, and RED condition groups */],
      }),
      evidenceBasis: EvidenceBasis.AUTHOR_DEFINED,
      status: SignalRuleStatus.CONFIRMED,
      methodology: Object.freeze({}),
      version: "1.0.0",
    }),
  }),
  display: Object.freeze({
    name: "Example Indicator",
    theme: "Growth",
    sentenceSubject: "The example indicator",
    providerLabel: "Federal Reserve Economic Data (FRED)",
    frequencyLabel: "Monthly",
    transformationLabel: "Current monthly reading",
    calculationDescription: "Uses the latest monthly source value.",
    ruleRationale: "Explain the existing signal boundaries.",
    marketImplication: "Explain the indicator-specific equity-market implication.",
    limitations: "Explain the indicator-specific methodological limitation.",
    dataNotes: Object.freeze([]),
    quickInfo: Object.freeze({
      valueStyle: "INDEX",
      interpretationStyle: "EXAMPLE",
      subject: "The example indicator",
      wording: "EXAMPLE",
    }),
  }),
});

validateIndicatorOnboardingDefinition(exampleIndicator);
```

The placeholders in the signal branches and human copy must be replaced before validation. The template is an onboarding shape, not a new registry or a default methodology.
