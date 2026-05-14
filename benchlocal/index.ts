import { createHostHelpers, defineBenchPack, loadBenchPackManifest, type ProgressEmitter, type ScenarioResult, type ScenarioRunInput } from "@benchlocal/sdk";
import {
  SCENARIOS,
  SCENARIO_DISPLAY_DETAILS,
  scoreModelResults as scoreToolCallResults,
  type ModelScenarioResult
} from "../lib/benchmark";
import { runScenarioForModel } from "../lib/orchestrator";

type ModelConfig = {
  id: string;
  label: string;
  provider: "openrouter" | "ollama" | "llamacpp" | "mlx" | "lmstudio" | "dashscope";
  model: string;
  baseUrl: string;
  apiKey?: string;
};

const manifest = loadBenchPackManifest(__dirname);

function toModelConfig(input: ScenarioRunInput, baseUrl: string, apiKey?: string): ModelConfig {
  return {
    id: input.model.id,
    label: input.model.label,
    provider: input.model.provider as ModelConfig["provider"],
    model: input.model.model,
    baseUrl,
    apiKey
  };
}

function toScenarioResult(result: ModelScenarioResult): ScenarioResult & { points: number } {
  return {
    scenarioId: result.scenarioId,
    status: result.status,
    score: result.points * 50,
    summary: result.summary,
    note: result.note,
    rawLog: result.rawLog,
    points: result.points
  };
}

export { manifest };

export default defineBenchPack({
  manifest,

  async listScenarios() {
    return SCENARIOS.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      description: scenario.description,
      promptText: scenario.userMessage,
      detailCards: [
        {
          title: "What this tests",
          content: scenario.description
        },
        {
          title: "Success case",
          content: SCENARIO_DISPLAY_DETAILS[scenario.id]?.successCase ?? "See benchmark definition."
        },
        {
          title: "Failure case",
          content: SCENARIO_DISPLAY_DETAILS[scenario.id]?.failureCase ?? "See benchmark definition."
        }
      ]
    }));
  },

  async prepare(context) {
    const helpers = createHostHelpers(context);

    return {
      async runScenario(input: ScenarioRunInput, emit: ProgressEmitter): Promise<ScenarioResult> {
        const scenario = helpers.getScenarioById(SCENARIOS, input.scenario.id);
        const provider = helpers.getRequiredProvider(input.model.provider, {
          enabledOnly: true
        });

        const result = await runScenarioForModel(
          toModelConfig(input, provider.baseUrl, helpers.getSecretValue(input.model.provider)),
          scenario,
          emit as Parameters<typeof runScenarioForModel>[2],
          {
            ...helpers.resolveGenerationRequest(input.generation),
            signal: input.abortSignal
          }
        );

        return toScenarioResult(result);
      },

      async dispose() {}
    };
  },

  scoreModelResults(results) {
    const summary = scoreToolCallResults(
      results.map((result) => ({
        scenarioId: result.scenarioId,
        status: result.status,
        points: "points" in result && typeof result.points === "number" ? result.points as 0 | 1 | 2 : result.score === undefined ? 0 : result.score >= 85 ? 2 : result.score >= 60 ? 1 : 0,
        summary: result.summary,
        note: result.note,
        rawLog: result.rawLog ?? ""
      }))
    );

    return {
      totalScore: summary.finalScore,
      categories: summary.categoryScores.map((category) => ({
        id: category.category,
        label: category.label,
        score: category.percent,
        weight: 20
      })),
      summary: summary.rating
    };
  }
});
