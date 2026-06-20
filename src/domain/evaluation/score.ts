import type { HarnessProvider } from "../events/normalized-event.js";

export const INITIAL_SCORE_WEIGHTS = {
  tests: 0.5,
  functional: 0.25,
  diff_quality: 0.1,
  efficiency: 0.1,
  restrictions: 0.05
} as const;

export type ScoreComponentName = keyof typeof INITIAL_SCORE_WEIGHTS;

export interface ScoreComponentInput {
  readonly score: number;
  readonly evidence: readonly string[];
}

export type ScoreComponentInputs = {
  readonly [Name in ScoreComponentName]: ScoreComponentInput;
};

export interface TrialEvaluationInput {
  readonly trial_id: string;
  readonly components: ScoreComponentInputs;
  readonly inconclusive?: boolean;
}

export interface EvaluateBenchmarkInput {
  readonly runId: string;
  readonly provider: HarnessProvider;
  readonly trials: readonly TrialEvaluationInput[];
}

export interface WeightedScoreComponent {
  readonly score: number;
  readonly weight: number;
  readonly weighted_score: number;
  readonly evidence: readonly string[];
}

export type WeightedScoreComponents = {
  readonly [Name in ScoreComponentName]: WeightedScoreComponent;
};

export interface TrialScore {
  readonly trial_id: string;
  readonly score_total: number;
  readonly components: WeightedScoreComponents;
  readonly inconclusive: boolean;
}

export interface EvaluationStatistics {
  readonly trials: number;
  readonly inconclusive_trials: number;
  readonly mean: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
  readonly stddev: number;
}

export interface BenchmarkEvaluationResult {
  readonly run_id: string;
  readonly provider: HarnessProvider;
  readonly weights: typeof INITIAL_SCORE_WEIGHTS;
  readonly score_total: number;
  readonly trial_scores: readonly TrialScore[];
  readonly statistics: EvaluationStatistics;
}

export function calculateBenchmarkEvaluation(input: EvaluateBenchmarkInput): BenchmarkEvaluationResult {
  const trialScores = input.trials.map(calculateTrialScore);
  const conclusiveScores = trialScores
    .filter((trial) => !trial.inconclusive)
    .map((trial) => trial.score_total);
  const statistics = calculateStatistics(conclusiveScores, trialScores.length - conclusiveScores.length);

  return {
    run_id: input.runId,
    provider: input.provider,
    weights: INITIAL_SCORE_WEIGHTS,
    score_total: statistics.mean,
    trial_scores: trialScores,
    statistics
  };
}

export function calculateTrialScore(input: TrialEvaluationInput): TrialScore {
  const components = Object.fromEntries(
    Object.entries(INITIAL_SCORE_WEIGHTS).map(([name, weight]) => {
      const componentName = name as ScoreComponentName;
      const component = input.components[componentName];
      const score = clampScore(component.score);

      return [componentName, {
        score,
        weight,
        weighted_score: round(score * weight * 100),
        evidence: component.evidence
      }];
    })
  ) as WeightedScoreComponents;

  const scoreTotal = round(
    (Object.keys(INITIAL_SCORE_WEIGHTS) as ScoreComponentName[])
      .reduce((sum, name) => sum + components[name].weighted_score, 0)
  );

  return {
    trial_id: input.trial_id,
    score_total: scoreTotal,
    components,
    inconclusive: input.inconclusive ?? false
  };
}

export function calculateStatistics(scores: readonly number[], inconclusiveTrials = 0): EvaluationStatistics {
  if (scores.length === 0) {
    return {
      trials: 0,
      inconclusive_trials: inconclusiveTrials,
      mean: 0,
      median: 0,
      min: 0,
      max: 0,
      stddev: 0
    };
  }

  const sorted = [...scores].sort((left, right) => left - right);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;

  return {
    trials: scores.length,
    inconclusive_trials: inconclusiveTrials,
    mean: round(mean),
    median: round(median),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    stddev: round(Math.sqrt(variance))
  };
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return Math.min(1, Math.max(0, score));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
