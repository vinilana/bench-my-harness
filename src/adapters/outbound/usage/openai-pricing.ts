interface OpenAiPricing {
  readonly inputUsdPerMillion: number;
  readonly cachedInputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
}

export type OpenAiPricingMode = "standard" | "priority";

export interface OpenAiPricingOptions {
  readonly mode?: OpenAiPricingMode;
}

export interface OpenAiPricingTokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
}

const TOKENS_PER_MILLION = 1_000_000;

const OPENAI_PRICING_BY_MODE: Record<OpenAiPricingMode, Record<string, OpenAiPricing>> = {
  standard: {
    "gpt-5.5": {
      inputUsdPerMillion: 5,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 30
    },
    "gpt-5.4": {
      inputUsdPerMillion: 2.5,
      cachedInputUsdPerMillion: 0.25,
      outputUsdPerMillion: 15
    },
    "gpt-5.4-mini": {
      inputUsdPerMillion: 0.75,
      cachedInputUsdPerMillion: 0.075,
      outputUsdPerMillion: 4.5
    },
    "gpt-5.4-nano": {
      inputUsdPerMillion: 0.2,
      cachedInputUsdPerMillion: 0.02,
      outputUsdPerMillion: 1.25
    },
    "gpt-5.3-codex": {
      inputUsdPerMillion: 1.75,
      cachedInputUsdPerMillion: 0.175,
      outputUsdPerMillion: 14
    }
  },
  priority: {
    "gpt-5.5": {
      inputUsdPerMillion: 12.5,
      cachedInputUsdPerMillion: 1.25,
      outputUsdPerMillion: 75
    },
    "gpt-5.4": {
      inputUsdPerMillion: 5,
      cachedInputUsdPerMillion: 0.5,
      outputUsdPerMillion: 30
    },
    "gpt-5.4-mini": {
      inputUsdPerMillion: 1.5,
      cachedInputUsdPerMillion: 0.15,
      outputUsdPerMillion: 9
    },
    "gpt-5.3-codex": {
      inputUsdPerMillion: 3.5,
      cachedInputUsdPerMillion: 0.35,
      outputUsdPerMillion: 28
    }
  }
};

export function calculateOpenAiCostUsd(
  model: string | undefined,
  usage: OpenAiPricingTokenUsage,
  options: OpenAiPricingOptions = {}
): number | undefined {
  const pricing = pricingForOpenAiModel(model, options.mode ?? "standard");
  if (pricing === undefined) {
    return undefined;
  }

  const cachedInputTokens = Math.min(usage.cachedInputTokens, usage.inputTokens);
  const uncachedInputTokens = usage.inputTokens - cachedInputTokens;

  return costForTokens(uncachedInputTokens, pricing.inputUsdPerMillion)
    + costForTokens(cachedInputTokens, pricing.cachedInputUsdPerMillion)
    + costForTokens(usage.outputTokens, pricing.outputUsdPerMillion);
}

export function parseOpenAiPricingMode(value: string | undefined): OpenAiPricingMode | undefined {
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "standard" || normalized === "priority" ? normalized : undefined;
}

function pricingForOpenAiModel(model: string | undefined, mode: OpenAiPricingMode): OpenAiPricing | undefined {
  if (model === undefined) {
    return undefined;
  }

  const key = pricingKeyForOpenAiModel(model);
  if (key === undefined) {
    return undefined;
  }

  return OPENAI_PRICING_BY_MODE[mode][key];
}

function pricingKeyForOpenAiModel(model: string): string | undefined {
  const normalizedModel = normalizedPricingKey(model);
  const normalizedCodexKey = normalizedPricingKey("gpt-5.3-codex");
  if (normalizedModel === normalizedCodexKey || normalizedModel.startsWith(`${normalizedCodexKey}-`)) {
    return "gpt-5.3-codex";
  }

  for (const key of Object.keys(OPENAI_PRICING_BY_MODE.standard)) {
    if (key === "gpt-5.3-codex") {
      continue;
    }
    const normalizedKey = normalizedPricingKey(key);
    if (normalizedModel === normalizedKey || hasSnapshotSuffix(normalizedModel, normalizedKey)) {
      return key;
    }
  }

  return undefined;
}

function hasSnapshotSuffix(model: string, key: string): boolean {
  if (!model.startsWith(`${key}-`)) {
    return false;
  }

  const suffix = model.slice(key.length + 1);
  return /^\d{4}-\d{2}-\d{2}$/.test(suffix) || /^\d{8}$/.test(suffix);
}

function normalizedPricingKey(value: string): string {
  return value.trim().toLowerCase().replace(/[.@]/g, "-");
}

function costForTokens(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / TOKENS_PER_MILLION;
}
