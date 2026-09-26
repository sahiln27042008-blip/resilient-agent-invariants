export interface ModelPricing {
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface BudgetEnvelope {
  maxCostUsd: number;
  maxWallClockMs: number;
  remainingCostUsd: number;
  startTimeMs: number;
}

export class BudgetExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExhaustedError";
  }
}

export class UnitEconomicsRuntime {
  private static PRICING_TABLE: Record<string, ModelPricing> = {
    "claude-3-5-haiku": { inputCostPerMillion: 0.8, outputCostPerMillion: 4.0 },
    "claude-3-5-sonnet": { inputCostPerMillion: 3.0, outputCostPerMillion: 15.0 },
    "gpt-4o-mini": { inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 },
    "gpt-4o": { inputCostPerMillion: 2.5, outputCostPerMillion: 10.0 },
  };

  public static initializeBudget(maxCostUsd: number, maxWallClockMs: number): BudgetEnvelope {
    return {
      maxCostUsd,
      maxWallClockMs,
      remainingCostUsd: maxCostUsd,
      startTimeMs: Date.now(),
    };
  }

  public static trackUsageAndCheck(
    envelope: BudgetEnvelope,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): void {
    const elapsedMs = Date.now() - envelope.startTimeMs;
    if (elapsedMs > envelope.maxWallClockMs) {
      throw new BudgetExhaustedError(
        `Execution killed: Wall-clock limit exceeded (${elapsedMs}ms > ${envelope.maxWallClockMs}ms)`
      );
    }

    const pricing = this.PRICING_TABLE[model];
    if (!pricing) {
      throw new Error(`Unknown model pricing for: ${model}`);
    }

    const stepCost =
      (inputTokens / 1_000_000) * pricing.inputCostPerMillion +
      (outputTokens / 1_000_000) * pricing.outputCostPerMillion;

    envelope.remainingCostUsd -= stepCost;

    if (envelope.remainingCostUsd <= 0) {
      throw new BudgetExhaustedError(
        `Execution killed: Spend limit of USD ${envelope.maxCostUsd.toFixed(4)} exhausted. Remaining: USD ${envelope.remainingCostUsd.toFixed(4)}`
      );
    }
  }

  public static selectModelTier(envelope: BudgetEnvelope, requiresComplexReasoning: boolean): string {
    // If complex reasoning is not required or remaining budget is dangerously low, downgrade
    if (!requiresComplexReasoning || envelope.remainingCostUsd < 0.02) {
      return "claude-3-5-haiku";
    }
    return "claude-3-5-sonnet";
  }
}
