import logger from "../config/logger";

export interface LLMTokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
}

export interface LLMUsageMetric extends LLMTokenUsage {
  totalTokens: number;
  agentId: string;
  provider: string;
  model: string;
  estimatedCostUsd: number;
  planId?: string;
  anomalous: boolean;
  createdAt: string;
}

export interface PlanLLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  calls: number;
  anomalous: boolean;
}

const DEFAULT_INPUT_COST_PER_MILLION = 0.8;
const DEFAULT_OUTPUT_COST_PER_MILLION = 4;
const DEFAULT_ANOMALY_THRESHOLD_TOKENS = 10000;

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

class LLMUsageMetrics {
  private readonly metrics: LLMUsageMetric[] = [];
  private readonly pendingByAgent = new Map<string, LLMUsageMetric[]>();

  record(
    agentId: string,
    usage: LLMTokenUsage,
    provider = "anthropic",
    model = "claude-3-5-haiku-20241022",
    planId?: string
  ): LLMUsageMetric {
    const inputCost = numericEnv(
      "AGENT_LLM_INPUT_COST_PER_MILLION_USD",
      DEFAULT_INPUT_COST_PER_MILLION
    );
    const outputCost = numericEnv(
      "AGENT_LLM_OUTPUT_COST_PER_MILLION_USD",
      DEFAULT_OUTPUT_COST_PER_MILLION
    );
    const totalTokens = usage.inputTokens + usage.outputTokens;
    const threshold = numericEnv(
      "AGENT_LLM_ANOMALY_THRESHOLD_TOKENS",
      DEFAULT_ANOMALY_THRESHOLD_TOKENS
    );
    const metric: LLMUsageMetric = {
      agentId,
      provider,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens,
      estimatedCostUsd:
        (usage.inputTokens * inputCost + usage.outputTokens * outputCost) / 1000000,
      planId,
      anomalous: totalTokens >= threshold,
      createdAt: new Date().toISOString(),
    };

    this.metrics.push(metric);

    if (!planId) {
      const pending = this.pendingByAgent.get(agentId) || [];
      pending.push(metric);
      this.pendingByAgent.set(agentId, pending);
    }

    if (metric.anomalous) {
      logger.warn("LLM token usage anomaly detected", {
        agentId,
        planId,
        totalTokens,
        thresholdTokens: threshold,
        estimatedCostUsd: metric.estimatedCostUsd,
      });
    }

    return metric;
  }

  attachToPlan(agentId: string, planId: string): LLMUsageMetric[] {
    const pending = this.pendingByAgent.get(agentId) || [];
    this.pendingByAgent.delete(agentId);

    for (const metric of pending) {
      metric.planId = planId;
    }

    return pending;
  }

  getPlanUsage(planId: string): PlanLLMUsage {
    return this.aggregate(this.metrics.filter((metric) => metric.planId === planId));
  }

  getAggregatedUsage(): PlanLLMUsage {
    return this.aggregate(this.metrics);
  }

  getMetrics(): LLMUsageMetric[] {
    return [...this.metrics];
  }

  clear(): void {
    this.metrics.length = 0;
    this.pendingByAgent.clear();
  }

  private aggregate(metrics: LLMUsageMetric[]): PlanLLMUsage {
    return metrics.reduce<PlanLLMUsage>(
      (result, metric) => ({
        inputTokens: result.inputTokens + metric.inputTokens,
        outputTokens: result.outputTokens + metric.outputTokens,
        totalTokens: result.totalTokens + metric.totalTokens,
        estimatedCostUsd: result.estimatedCostUsd + metric.estimatedCostUsd,
        calls: result.calls + 1,
        anomalous: result.anomalous || metric.anomalous,
      }),
      {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedCostUsd: 0,
        calls: 0,
        anomalous: false,
      }
    );
  }
}

export const llmUsageMetrics = new LLMUsageMetrics();
