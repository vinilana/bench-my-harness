import {
  calculateBenchmarkEvaluation,
  type BenchmarkEvaluationResult,
  type EvaluateBenchmarkInput
} from "../../domain/evaluation/score.js";

export function evaluateBenchmark(input: EvaluateBenchmarkInput): BenchmarkEvaluationResult {
  return calculateBenchmarkEvaluation(input);
}
