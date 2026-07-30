# Agent LLM usage and cost monitoring

LLM usage is recorded for every successful Anthropic call. Each metric includes input tokens, output tokens, total tokens, provider, model, and an estimated USD cost. Plan-level aggregates are available through `llmUsageMetrics.getPlanUsage(planId)`, and overall aggregates are available through `getAggregatedUsage()` in `src/observability/llmUsageMetrics.ts`.

The planner must call `llmUsageMetrics.attachToPlan(agentId, planId)` after creating the plan when the LLM call did not receive the plan ID as its trace ID. This associates every pending call for that planner execution with the resulting `ExecutionPlan`.

## Configuration

The default pricing assumes:

- Input: $0.80 per million tokens
- Output: $4.00 per million tokens
- Anomaly threshold: 10,000 total tokens per call

These values can be overridden with:

- `AGENT_LLM_INPUT_COST_PER_MILLION_USD`
- `AGENT_LLM_OUTPUT_COST_PER_MILLION_USD`
- `AGENT_LLM_ANOMALY_THRESHOLD_TOKENS`

When a call reaches or exceeds the threshold, the metrics collector emits a warning through the application logger with the agent ID, token count, threshold, and estimated cost. Consumers of the observability module should route that warning to the existing alerting backend.
