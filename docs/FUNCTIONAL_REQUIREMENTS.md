# Functional Requirements

This document details the functional requirements and core components of the Trustwise Policy Engine.

---

## Table of Contents

- [1. Policy CRUD Operations](#1-policy-crud-operations)
- [2. Policy Evaluation Engine](#2-policy-evaluation-engine)
- [3. Judge Interface](#3-judge-interface)
- [4. Aggregator Interface](#4-aggregator-interface)
- [5. Output Format](#5-output-format)

---

## 1. Policy CRUD Operations

### Policy Structure

```typescript
interface Policy {
  name: string;                           // Unique policy identifier
  version?: string;                       // Semantic version
  default_action: 'allow' | 'block' | 'warn' | 'redact';
  rules: Rule[];                          // Array of evaluation rules
  evaluation_strategy: 'all' | 'any' | 'weighted_threshold';
  threshold?: number;                     // Required for weighted_threshold (0-1)
}

interface Rule {
  id: string;                             // Unique rule identifier
  description?: string;                   // Human-readable description
  judge_prompt: string;                   // LLM evaluation prompt
  on_fail: 'allow' | 'block' | 'warn' | 'redact';
  weight?: number;                        // Rule weight for scoring (0-1)
}
```

### API Endpoints

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| **Get Config** | `GET /api/policy/config` | Retrieve current policy configuration |
| **Update Config** | `POST /api/policy/config` | Update policy, judge, or settings |
| **Reload Config** | `POST /api/policy/config/reload` | Reload configuration from MongoDB |
| **Reset Config** | `POST /api/policy/config/reset` | Reset to default configuration |
| **Validate** | `POST /api/policy/validate` | Validate policy without applying |

### Rule Management

| Operation | Endpoint | Description |
|-----------|----------|-------------|
| **Add Rule** | `POST /api/policy/rules` | Add new rule to policy |
| **Update Rule** | `PUT /api/policy/rules/:ruleId` | Update existing rule |
| **Delete Rule** | `DELETE /api/policy/rules/:ruleId` | Remove rule from policy |

### Example: Create Rule

```json
POST /api/policy/rules
{
  "id": "no_hate_speech",
  "description": "Detect and prevent hate speech",
  "judge_prompt": "Evaluate if the content contains hate speech, discrimination, or harmful stereotypes targeting any group.",
  "on_fail": "block",
  "weight": 1.0
}
```

---

## 2. Policy Evaluation Engine

### Overview

The **PolicyEngine** is the main orchestrator responsible for:

1. Accepting content and policy configuration
2. Dispatching rules to JudgeService (parallel or sequential)
3. Collecting judge verdicts
4. Aggregating results using configured strategy
5. Returning structured verdict with metrics

### Evaluation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     PolicyEngine.evaluate()                      │
├─────────────────────────────────────────────────────────────────┤
│  1. Receive content + policy                                    │
│  2. For each rule:                                              │
│     └─→ JudgeService.evaluate(rule, content)                    │
│         └─→ Returns { verdict, confidence, reasoning }          │
│  3. Collect all rule results                                    │
│  4. AggregationStrategy.aggregate(results, policy)              │
│  5. Return PolicyVerdict                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Evaluation Modes

| Mode | Configuration | Description |
|------|---------------|-------------|
| **Parallel** | `settings.parallelEvaluation: true` | All rules evaluated concurrently |
| **Sequential** | `settings.parallelEvaluation: false` | Rules evaluated one-by-one |

### Example: Evaluate Content

```json
POST /api/policy/evaluate
{
  "content": "Your text content to evaluate",
  "policy": null  // Optional: override default policy
}
```

### Events Emitted

The PolicyEngine emits events for observability:

| Event | Trigger | Payload |
|-------|---------|---------|
| `policy:evaluation-start` | Evaluation begins | policyName, contentLength, timestamp |
| `policy:evaluation-complete` | Evaluation succeeds | policyName, finalVerdict, totalLatency |
| `policy:evaluation-error` | Evaluation fails | policyName, error, totalLatency |
| `policy:config-updated` | Config changes | policyName |
| `policy:rule-added` | Rule added | rule |
| `policy:rule-updated` | Rule modified | rule |
| `policy:rule-deleted` | Rule removed | ruleId |

---

## 3. Judge Interface

### Overview

The **JudgeService** provides an abstraction layer for LLM-based content evaluation. It handles:

- OpenAI API integration
- Retry logic with exponential backoff
- Circuit breaker pattern
- Rate limit handling
- Response parsing and normalization

### Judge Configuration

```typescript
interface JudgeConfig {
  model: string;                 // Default: 'gpt-4o-mini'
  temperature: number;           // Default: 0.1 (deterministic)
  maxTokens: number;             // Default: 500
  timeout: number;               // Default: 30000ms
  maxRetries: number;            // Default: 3
  retryDelay: number;            // Default: 1000ms
  circuitBreakerThreshold?: number;  // Default: 5 failures
  circuitBreakerResetMs?: number;    // Default: 30000ms
}
```

### Judge Evaluation Process

```
┌─────────────────────────────────────────────────────────────────┐
│                   JudgeService.evaluate(rule, content)           │
├─────────────────────────────────────────────────────────────────┤
│  1. Check circuit breaker state                                 │
│  2. Build LLM prompt with rule criteria                         │
│  3. Call OpenAI API with JSON mode                              │
│  4. Parse response to { verdict, confidence, reasoning }        │
│  5. Handle errors with retry logic                              │
│  6. Update circuit breaker state                                │
│  7. Return JudgeEvaluationResult                                │
└─────────────────────────────────────────────────────────────────┘
```

### Verdict Types

| Verdict | Description | Confidence Range |
|---------|-------------|------------------|
| `PASS` | Content meets rule criteria | 0.0 - 1.0 |
| `FAIL` | Content violates rule criteria | 0.0 - 1.0 |
| `UNCERTAIN` | Cannot determine with confidence | 0.0 - 0.5 |

### LLM System Prompt

The Judge uses a structured prompt format:

```
You are a content moderation judge. Evaluate the provided content against the given rule.

RULE: {rule.description}
CRITERIA: {rule.judge_prompt}

You MUST respond with ONLY a valid JSON object:
{
  "verdict": "PASS" or "FAIL" or "UNCERTAIN",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation"
}

Guidelines:
- PASS: Content clearly meets the criteria
- FAIL: Content clearly violates the criteria
- UNCERTAIN: Cannot determine with confidence
```

---

## 4. Aggregator Interface

### Overview

The **AggregationStrategy** module determines the final verdict by aggregating individual rule results. Three strategies are available.

### Strategy Interface

```typescript
interface AggregationStrategyInterface {
  aggregate(ruleResults: RuleResult[], policy: Policy): AggregationResult;
}
```

### Available Strategies

#### 1. ALL Strategy (Default)

All rules must pass for content to be allowed.

| Scenario | Final Verdict |
|----------|---------------|
| All rules PASS | `ALLOW` |
| Any rule FAIL | Most severe failed action (`BLOCK`/`REDACT`/`WARN`) |
| Any rule UNCERTAIN (no fails) | `WARN` |

```typescript
policy.evaluation_strategy = 'all';
```

#### 2. ANY Strategy

At least one rule must pass for content to be allowed.

| Scenario | Final Verdict |
|----------|---------------|
| Any rule PASS | `ALLOW` |
| No rules PASS, some UNCERTAIN | `WARN` |
| All rules FAIL | Most severe failed action |

```typescript
policy.evaluation_strategy = 'any';
```

#### 3. WEIGHTED_THRESHOLD Strategy

Weighted sum of passed rules must exceed threshold.

```typescript
policy.evaluation_strategy = 'weighted_threshold';
policy.threshold = 0.7;  // 70% weighted pass required
```

**Score Calculation:**
```
score = Σ(passed_rule.weight) / Σ(all_rules.weight)
UNCERTAIN rules count as 50% weight

If score >= threshold: ALLOW
Else: BLOCK/WARN/REDACT
```

### Action Priority

When multiple rules fail, the most severe action wins:

| Action | Priority |
|--------|----------|
| `block` | 3 (highest) |
| `redact` | 2 |
| `warn` | 1 |
| `allow` | 0 (lowest) |

---

## 5. Output Format

### PolicyVerdict Response

```typescript
interface PolicyVerdict {
  policy_name: string;           // Policy identifier
  policy_version?: string;       // Policy version
  final_verdict: FinalVerdict;   // ALLOW | BLOCK | WARN | REDACT | ERROR
  passed: boolean;               // Overall pass/fail
  evaluated_at: string;          // ISO timestamp
  rule_results: RuleResult[];    // Individual rule outcomes
  summary?: AggregationSummary;  // Strategy details
  error?: string;                // Error message if failed
  total_latency_ms: number;      // Total evaluation time
  evaluationId?: string;         // History record ID
}
```

### RuleResult Structure

```typescript
interface RuleResult {
  rule_id: string;               // Rule identifier
  verdict: Verdict;              // PASS | FAIL | UNCERTAIN
  confidence: number;            // 0.0 to 1.0
  reasoning: string;             // LLM explanation
  action: Action;                // Rule's on_fail action
  weight: number;                // Rule weight
  latency_ms: number;            // Rule evaluation time
}
```

### AggregationSummary Structure

```typescript
interface AggregationSummary {
  strategy: EvaluationStrategy;  // all | any | weighted_threshold
  total_rules: number;
  passed: number;
  failed: number;
  uncertain: number;
  reason: string;                // Human-readable explanation
  score?: number;                // For weighted_threshold
  threshold?: number;            // For weighted_threshold
}
```

### Example Response

```json
{
  "policy_name": "content_safety_policy",
  "policy_version": "1.0.0",
  "final_verdict": "ALLOW",
  "passed": true,
  "evaluated_at": "2025-12-03T10:30:00.000Z",
  "evaluationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "rule_results": [
    {
      "rule_id": "no_hate_speech",
      "verdict": "PASS",
      "confidence": 0.95,
      "reasoning": "Content is professional and contains no hate speech",
      "action": "block",
      "weight": 1.0,
      "latency_ms": 245
    },
    {
      "rule_id": "no_pii",
      "verdict": "PASS",
      "confidence": 0.92,
      "reasoning": "No personally identifiable information detected",
      "action": "redact",
      "weight": 0.9,
      "latency_ms": 198
    }
  ],
  "summary": {
    "strategy": "all",
    "total_rules": 2,
    "passed": 2,
    "failed": 0,
    "uncertain": 0,
    "reason": "All rules passed"
  },
  "total_latency_ms": 456
}
```

### Final Verdict Types

| Verdict | Meaning |
|---------|---------|
| `ALLOW` | Content passed all criteria |
| `BLOCK` | Content rejected - severe violation |
| `WARN` | Content allowed with caution flag |
| `REDACT` | Content allowed but needs redaction |
| `ERROR` | Evaluation failed due to system error |

