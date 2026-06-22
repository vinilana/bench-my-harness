interface ClaudePricing {
  readonly input: number;
  readonly output: number;
  readonly cacheCreate: number;
  readonly cacheRead: number;
  readonly inputAbove200k?: number;
  readonly outputAbove200k?: number;
  readonly cacheCreateAbove200k?: number;
  readonly cacheReadAbove200k?: number;
}

export interface ClaudePricingTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationInputTokens: number;
  readonly cacheReadInputTokens: number;
  readonly cacheCreationEphemeral5mInputTokens?: number;
  readonly cacheCreationEphemeral1hInputTokens?: number;
  readonly speed?: string;
}

const ABOVE_200K_THRESHOLD = 200_000;
const FAST_SPEED_MULTIPLIER = 5;

// Built-in Claude pricing model for BMH's Claude Code v1 usage estimates.
const CLAUDE_PRICING: Record<string, ClaudePricing> = {
  "claude-sonnet-4": {
    input: 3e-6,
    output: 15e-6,
    cacheCreate: 3.75e-6,
    cacheRead: 0.3e-6,
    inputAbove200k: 6e-6,
    outputAbove200k: 22.5e-6,
    cacheCreateAbove200k: 7.5e-6,
    cacheReadAbove200k: 0.6e-6
  },
  "claude-sonnet-4-5": {
    input: 3e-6,
    output: 15e-6,
    cacheCreate: 3.75e-6,
    cacheRead: 0.3e-6
  },
  "claude-sonnet-4-6": {
    input: 3e-6,
    output: 15e-6,
    cacheCreate: 3.75e-6,
    cacheRead: 0.3e-6
  },
  "claude-haiku-4-5": {
    input: 1e-6,
    output: 5e-6,
    cacheCreate: 1.25e-6,
    cacheRead: 0.1e-6
  },
  "claude-opus-4": {
    input: 15e-6,
    output: 75e-6,
    cacheCreate: 18.75e-6,
    cacheRead: 1.5e-6
  },
  "claude-opus-4-5": {
    input: 5e-6,
    output: 25e-6,
    cacheCreate: 6.25e-6,
    cacheRead: 0.5e-6
  },
  "claude-opus-4-8": {
    input: 5e-6,
    output: 25e-6,
    cacheCreate: 6.25e-6,
    cacheRead: 0.5e-6
  },
  "claude-fable-5": {
    input: 10e-6,
    output: 50e-6,
    cacheCreate: 12.5e-6,
    cacheRead: 1e-6
  }
};

export function calculateClaudeCostUsd(model: string | undefined, usage: ClaudePricingTokenUsage): number | undefined {
  const pricing = pricingForClaudeModel(model);
  if (pricing === undefined) {
    return undefined;
  }

  const multiplier = usage.speed === "fast" ? FAST_SPEED_MULTIPLIER : 1;
  const inputCost = costForTieredTokens(usage.inputTokens, pricing.input, pricing.inputAbove200k);
  const outputCost = costForTieredTokens(usage.outputTokens, pricing.output, pricing.outputAbove200k);
  const cacheReadCost = costForTieredTokens(usage.cacheReadInputTokens, pricing.cacheRead, pricing.cacheReadAbove200k);
  const cacheCreateCost = cacheCreationCost(usage, pricing);

  return (inputCost + outputCost + cacheReadCost + cacheCreateCost) * multiplier;
}

function cacheCreationCost(usage: ClaudePricingTokenUsage, pricing: ClaudePricing): number {
  if (
    usage.cacheCreationEphemeral5mInputTokens !== undefined
    || usage.cacheCreationEphemeral1hInputTokens !== undefined
  ) {
    const ephemeral5m = usage.cacheCreationEphemeral5mInputTokens ?? 0;
    const ephemeral1h = usage.cacheCreationEphemeral1hInputTokens ?? 0;
    return costForTieredTokens(ephemeral5m, pricing.cacheCreate, pricing.cacheCreateAbove200k)
      + costForTieredTokens(ephemeral1h, pricing.input * 2, pricing.inputAbove200k === undefined ? undefined : pricing.inputAbove200k * 2);
  }

  return costForTieredTokens(usage.cacheCreationInputTokens, pricing.cacheCreate, pricing.cacheCreateAbove200k);
}

function costForTieredTokens(tokens: number, basePrice: number, above200kPrice: number | undefined): number {
  if (above200kPrice === undefined || tokens <= ABOVE_200K_THRESHOLD) {
    return tokens * basePrice;
  }

  return (ABOVE_200K_THRESHOLD * basePrice) + ((tokens - ABOVE_200K_THRESHOLD) * above200kPrice);
}

function pricingForClaudeModel(model: string | undefined): ClaudePricing | undefined {
  if (model === undefined) {
    return undefined;
  }

  const normalizedModel = normalizedPricingKey(model);
  let best: { key: string; pricing: ClaudePricing } | undefined;

  for (const [key, pricing] of Object.entries(CLAUDE_PRICING)) {
    if (!pricingKeyMatches(key, model, normalizedModel)) {
      continue;
    }
    if (best === undefined || key.length > best.key.length) {
      best = { key, pricing };
    }
  }

  return best?.pricing;
}

function pricingKeyMatches(candidate: string, model: string, normalizedModel: string): boolean {
  if (containsPricingKey(model, candidate) || containsPricingKey(candidate, model)) {
    return true;
  }

  const normalizedCandidate = normalizedPricingKey(candidate);
  return containsPricingKey(normalizedModel, normalizedCandidate)
    || containsPricingKey(normalizedCandidate, normalizedModel);
}

function containsPricingKey(value: string, key: string): boolean {
  let index = value.indexOf(key);
  while (index !== -1) {
    const before = index === 0 ? undefined : value.charCodeAt(index - 1);
    const suffix = value.slice(index + key.length);
    if (isPricingKeyBoundary(before) && suffixAllowsPricingKeyMatch(key, suffix)) {
      return true;
    }
    index = value.indexOf(key, index + 1);
  }

  return false;
}

function isPricingKeyBoundary(code: number | undefined): boolean {
  return code === undefined || !isAsciiAlphanumeric(code);
}

function suffixAllowsPricingKeyMatch(key: string, suffix: string): boolean {
  if (suffix.length === 0) {
    return true;
  }
  const separator = suffix.charCodeAt(0);
  if (!isPricingKeyBoundary(separator)) {
    return false;
  }

  return !suffixStartsWithNumericModelVersion(key, suffix);
}

function suffixStartsWithNumericModelVersion(key: string, suffix: string): boolean {
  if (!isAsciiDigit(key.charCodeAt(key.length - 1))) {
    return false;
  }
  if (suffix[0] !== "-" && suffix[0] !== ".") {
    return false;
  }

  const rest = suffix.slice(1);
  let digitLength = 0;
  while (digitLength < rest.length && isAsciiDigit(rest.charCodeAt(digitLength))) {
    digitLength += 1;
  }

  if (digitLength === 0) {
    return false;
  }

  const afterDigits = digitLength >= rest.length ? undefined : rest.charCodeAt(digitLength);
  return !(digitLength === 8 && isPricingKeyBoundary(afterDigits));
}

function normalizedPricingKey(value: string): string {
  return value.replace(/[.@]/g, "-");
}

function isAsciiAlphanumeric(code: number): boolean {
  return isAsciiDigit(code)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}
