import { applyTransformation } from "../transformations/TransformationEngine.js";
import { SignalColor } from "./SignalRule.js";

function unknownSignal(entry, rule, evaluatedAt, reason) {
  return {
    indicatorId: entry.indicatorId,
    sourceRole: entry.source.role ?? null,
    status: "UNKNOWN",
    color: SignalColor.UNKNOWN,
    transformedValue: null,
    evaluatedAt,
    ruleId: rule?.ruleId ?? null,
    ruleVersion: rule?.version ?? null,
    evidenceBasis: rule?.evidenceBasis ?? null,
    reason,
  };
}

export class SignalEvaluationService {
  constructor({ historyPreparation, signalEngine, resolveRule, transform = applyTransformation, now = () => new Date() }) {
    this.historyPreparation = historyPreparation;
    this.signalEngine = signalEngine;
    this.resolveRule = resolveRule;
    this.transform = transform;
    this.now = now;
  }

  async evaluate(entry) {
    const rule = this.resolveRule(entry.id);
    if (!rule) return {
      entry: entry.id,
      history: null,
      transformedResult: null,
      signal: unknownSignal(entry, null, this.now().toISOString(), "SIGNAL_RULE_NOT_FOUND"),
    };

    let history;
    try {
      history = await this.historyPreparation.prepare(entry);
    } catch (error) {
      return {
        entry: entry.id,
        history: null,
        transformedResult: null,
        signal: unknownSignal(entry, rule, this.now().toISOString(), `HISTORY_PREPARATION_FAILED: ${error.code ?? error.message}`),
      };
    }

    let transformedResult = null;
    if (history.ready) {
      try {
        transformedResult = this.transform(entry.transformation, history.preparedObservations);
      } catch (error) {
        return {
          entry: entry.id,
          history,
          transformedResult: null,
          signal: unknownSignal(entry, rule, this.now().toISOString(), `TRANSFORMATION_FAILED: ${error.code ?? error.message}`),
        };
      }
    }

    return {
      entry: entry.id,
      history,
      transformedResult,
      signal: this.signalEngine.evaluate(rule, transformedResult, { historyReadiness: history }),
    };
  }
}
