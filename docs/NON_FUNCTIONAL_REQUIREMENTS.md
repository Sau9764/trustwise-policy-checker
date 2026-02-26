# Non-Functional Requirements

This document details the non-functional requirements including concurrency, resilience, observability, and scalability aspects of Trustwise.

---

## Table of Contents

- [1. Concurrency and Resilience](#1-concurrency-and-resilience)
- [2. Observability](#2-observability)
- [3. Extensibility and Testability](#3-extensibility-and-testability)
- [4. Deterministic and Auditable](#4-deterministic-and-auditable)
- [5. Latency Requirements](#5-latency-requirements)
- [6. Scalability Requirements](#6-scalability-requirements)

---

## 1. Concurrency and Resilience

### Parallel Rule Evaluation

Rules are evaluated in parallel by default for optimal performance:

```typescript
// Configuration
settings: {
  parallelEvaluation: true  // Default: true
}
```

**Parallel Evaluation Flow:**
```
┌─────────────────────────────────────────────────────────────┐
│           Parallel Rule Evaluation (Promise.all)            │
├─────────────────────────────────────────────────────────────┤
│  Content ─┬─→ Rule 1 ─→ JudgeService ─→ Result 1 ─┐        │
│           ├─→ Rule 2 ─→ JudgeService ─→ Result 2 ─┼─→ Aggregate
│           └─→ Rule 3 ─→ JudgeService ─→ Result 3 ─┘        │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- Reduced total latency (max rule latency vs sum of all)
- Efficient use of LLM API concurrent connections
- Independent rule failures don't block others

### Timeout Handling

Configurable timeouts at multiple levels:

| Level | Default | Configuration |
|-------|---------|---------------|
| HTTP Request | 30s | `judge.timeout` |
| Connection Pool | 30s | HTTP Agent `timeout` |
| Keep-Alive | 30s | HTTP Agent `keepAliveMsecs` |

```typescript
// JudgeConfig
judge: {
  timeout: 30000,      // Overall request timeout
  maxRetries: 3,       // Retry attempts
  retryDelay: 1000     // Initial retry delay
}
```

### Rate Limit Handling

The JudgeService automatically detects and handles OpenAI rate limits:

```typescript
// Rate limit detection
if (status === 429 || message.includes('rate limit')) {
  // Parse Retry-After header
  // Apply longer backoff delay
  // Track in metrics
}
```

**Rate Limit Response:**
- Default wait: 60 seconds
- Respects `Retry-After` header
- Exponential backoff on subsequent hits

### API rate limiting (IP-based)

Incoming requests to the API are limited **per client IP** to protect the server and downstream LLM from abuse.

| Aspect | Detail |
|--------|--------|
| **Scope** | All routes under `/api` (policy and history) |
| **Key** | Client IP (`req.ip`; set `TRUST_PROXY=1` when behind a reverse proxy so the real client IP is used) |
| **Window** | Configurable via `RATE_LIMIT_WINDOW_MS` (default: 60 000 ms = 1 minute) |
| **Limit** | Configurable via `RATE_LIMIT_MAX_PER_WINDOW` (default: 60 requests per IP per window) |
| **Response** | HTTP 429 Too Many Requests with a JSON body and `Retry-After`-style information |

**Configuration (env):**

```bash
# Optional overrides (defaults shown)
RATE_LIMIT_WINDOW_MS=60000      # Window length in milliseconds
RATE_LIMIT_MAX_PER_WINDOW=60     # Max requests per IP per window
TRUST_PROXY=0                   # Set to 1 or true behind nginx/load balancer for correct client IP
```

**Implementation:** `server/src/middleware/rateLimiter.ts` using `express-rate-limit`; applied in `server/src/index.ts` with `app.use('/api', apiRateLimiter)`.

### Rate limiting pointers (summary)

| Layer | What is limited | Where documented / implemented |
|-------|------------------|---------------------------------|
| **API (incoming)** | Requests per client IP to `/api/*` | This section; `server/src/middleware/rateLimiter.ts`, `server/src/index.ts` |
| **Downstream (LLM)** | Handling of provider 429 (e.g. OpenAI); retries and backoff | [Rate Limit Handling](#rate-limit-handling) above; `server/src/services/JudgeService.ts` |

For production at scale, consider a shared store (e.g. Redis) for the API rate limiter so limits are consistent across multiple server instances (see [Future Scalability Enhancements](#future-scalability-enhancements)).

### Transient Failure Handling

Retry logic with exponential backoff and jitter:

```typescript
interface RetryConfig {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  jitterFactor: 0.1  // 10% random jitter
}
```

**Retry Flow:**
```
Attempt 1 → Fail → Wait 1000ms
Attempt 2 → Fail → Wait 2000ms ± 200ms jitter
Attempt 3 → Fail → Wait 4000ms ± 400ms jitter
→ Return UNCERTAIN verdict
```

**Retryable Errors:**
- `TIMEOUT` - Request timeouts
- `RATE_LIMIT` - API rate limits
- `SERVER_ERROR` - 5xx responses
- `NETWORK_ERROR` - Connection issues

**Non-Retryable Errors:**
- `AUTH_ERROR` - Invalid API key
- `PARSE_ERROR` - Invalid response format

### Circuit Breaker Pattern

Protection against degraded LLM services:

```
┌─────────────────────────────────────────────────────────────┐
│                    Circuit Breaker States                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐  5 failures  ┌────────┐  30s timeout ┌──────────┐
│  │ CLOSED  │────────────→ │  OPEN  │─────────────→│HALF_OPEN │
│  └────┬────┘              └────────┘              └────┬─────┘
│       ↑                                                │
│       │                  2 successes                   │
│       └────────────────────────────────────────────────┘
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Configuration:**

```typescript
circuitBreaker: {
  failureThreshold: 5,           // Failures to trip
  resetTimeoutMs: 30000,         // Time in OPEN state
  halfOpenSuccessThreshold: 2    // Successes to close
}
```

**States:**

| State | Behavior |
|-------|----------|
| `CLOSED` | Normal operation, requests pass through |
| `OPEN` | All requests fail immediately |
| `HALF_OPEN` | Limited requests allowed to test recovery |

**Events:**
- `judge:circuit-open` - Circuit tripped
- `judge:circuit-half-open` - Testing recovery
- `judge:circuit-closed` - Service recovered
- `judge:circuit-reset` - Manual reset

---

## 2. Observability

### Logging

Structured logging throughout the system:

```typescript
// Logger interface
interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
}
```

**Log Examples:**

```
[PolicyEngine] Starting evaluation { policyName, contentLength, rulesCount, strategy }
[PolicyEngine] Evaluation complete { policyName, finalVerdict, passed, totalLatency }
[JudgeService] Evaluating rule { ruleId, contentLength, circuitState }
[JudgeService] Circuit breaker OPEN { failureCount, resetTimeoutMs }
```

### Metrics

Real-time metrics available via `JudgeService.getMetrics()`:

```typescript
interface JudgeMetricsReport {
  requests: number;          // Total requests
  successes: number;         // Successful evaluations
  failures: number;          // Failed evaluations
  retries: number;           // Retry attempts
  timeouts: number;          // Timeout errors
  rateLimits: number;        // Rate limit hits
  circuitBreakerTrips: number;  // Circuit trips
  totalLatency: number;      // Cumulative latency
  averageLatency: string;    // Avg latency (e.g., "245.50ms")
  successRate: string;       // Success rate (e.g., "98.50%")
  circuitState: CircuitState;
  circuitFailureCount: number;
  isRateLimited: boolean;
}
```

**Exposed Metrics Endpoints:**

```
GET /api/policy/health     → Engine + Judge health with metrics
GET /api/history/stats     → Evaluation statistics
```

### History & Audit Trail

All evaluations stored in MongoDB for audit:

```typescript
// EvaluationHistory document
{
  evaluationId: "uuid",
  content: "evaluated content",
  policySnapshot: { /* complete policy at evaluation time */ },
  result: {
    final_verdict: "ALLOW",
    passed: true,
    rule_results: [...],
    summary: {...},
    total_latency_ms: 456
  },
  metadata: {
    evaluatedAt: Date,
    tags: ["production"],
    notes: "optional notes",
    environment: "production"
  }
}
```

**History API:**

| Endpoint | Description |
|----------|-------------|
| `GET /api/history` | List with pagination & filters |
| `GET /api/history/stats` | Aggregated statistics |
| `GET /api/history/:id` | Single evaluation details |
| `POST /api/history/:id/rerun` | Replay evaluation |

### Error Handling

Categorized error types for precise handling:

```typescript
enum ErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN = 'UNKNOWN'
}
```

### Execution Tracing

Event-driven architecture for tracing:

```typescript
// PolicyEngine events
policyEngine.on('policy:evaluation-start', (data) => {
  console.log(`[TRACE] Evaluation started: ${data.policyName}`);
});

policyEngine.on('policy:evaluation-complete', (data) => {
  console.log(`[TRACE] Completed in ${data.totalLatency}ms`);
});

// JudgeService events
judgeService.on('judge:evaluation-start', (data) => {...});
judgeService.on('judge:evaluation-complete', (data) => {...});
judgeService.on('judge:circuit-open', (data) => {...});
```

---

## 3. Extensibility and Testability

### Mock Mode

Full mock support for testing without LLM calls:

```typescript
// Enable mock mode
policyEngine.setMockMode(true, {
  'no_hate_speech': {
    verdict: 'PASS',
    confidence: 0.95,
    reasoning: 'Mock: No hate speech detected'
  },
  'no_pii': {
    verdict: 'FAIL',
    confidence: 0.88,
    reasoning: 'Mock: PII detected'
  }
});

// Dynamic mock responses
policyEngine.setMockMode(true, {
  'custom_rule': (content) => ({
    verdict: content.includes('bad') ? 'FAIL' : 'PASS',
    confidence: 0.9,
    reasoning: 'Dynamic evaluation'
  })
});
```

### Strategy Pattern

Custom aggregation strategies via interface:

```typescript
class CustomStrategy extends BaseStrategy {
  aggregate(ruleResults: RuleResult[], policy: Policy): AggregationResult {
    // Custom aggregation logic
  }
}
```

### Modular Architecture

Clear separation of concerns:

```
┌──────────────────────────────────────────────────────────┐
│                      API Layer                           │
│                    (PolicyRoutes)                        │
├──────────────────────────────────────────────────────────┤
│                   Service Layer                          │
│  ┌────────────────┐  ┌────────────────┐                 │
│  │ PolicyEngine   │  │ HistoryService │                 │
│  └───────┬────────┘  └────────────────┘                 │
│          │                                               │
│  ┌───────┴────────┐  ┌────────────────┐                 │
│  │ JudgeService   │  │ ConfigService  │                 │
│  └───────┬────────┘  └────────────────┘                 │
│          │                                               │
│  ┌───────┴────────┐                                     │
│  │ AggregationStrategy │                                │
│  └────────────────┘                                     │
├──────────────────────────────────────────────────────────┤
│                   Data Layer                             │
│                   (MongoDB)                              │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Deterministic and Auditable

### Deterministic Aggregation

The same set of judge verdicts **always** produces the same final verdict:

```typescript
// Aggregation is purely deterministic
// Given: [PASS, FAIL, PASS] with strategy 'all'
// Always returns: FAIL (blocked by the failed rule)

// No random factors in aggregation
// Order-independent (same results regardless of evaluation order)
```

**Guarantees:**
- No randomness in aggregation logic
- Strategy-based rules are explicit and documented
- Action priority deterministically resolves conflicts

### Reproducible Evaluations

Policy snapshots enable exact replay:

```typescript
// History stores complete policy at evaluation time
{
  policySnapshot: {
    name: "policy_v1",
    version: "1.2.3",
    rules: [...],  // Complete rule definitions
    evaluation_strategy: "all",
    threshold: null
  }
}

// Replay with original policy
POST /api/history/:evaluationId/rerun
{
  "saveToHistory": true
}
```

**Reproducibility Factors:**
- Policy snapshot stored with each evaluation
- Original content preserved
- Same policy yields same aggregation result
- LLM responses may vary (temperature > 0)

### Audit Trail

Complete audit trail in MongoDB:

```typescript
// Queryable audit data
GET /api/history?policyName=content_safety&verdict=BLOCK&startDate=2025-01-01

// Detailed breakdown available
GET /api/history/:evaluationId
→ Returns full rule-by-rule results with reasoning
```

**Audit Fields:**
- `evaluationId` - Unique identifier
- `evaluatedAt` - Timestamp
- `environment` - dev/staging/production
- `tags` - Custom labels
- `notes` - Manual annotations

---

## 5. Latency Requirements

### Baseline Latency Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Single rule evaluation | < 1s | Depends on LLM provider |
| Policy evaluation (3 rules, parallel) | < 2s | Max rule latency + overhead |
| Policy evaluation (3 rules, sequential) | < 4s | Sum of rule latencies |
| History save | < 50ms | MongoDB write |
| Config operations | < 100ms | MongoDB read/write |

### Latency Tracking

Every evaluation returns latency metrics:

```json
{
  "rule_results": [
    { "rule_id": "rule_1", "latency_ms": 245 },
    { "rule_id": "rule_2", "latency_ms": 312 },
    { "rule_id": "rule_3", "latency_ms": 198 }
  ],
  "total_latency_ms": 456  // Parallel: max + overhead
}
```

### Optimization Features

1. **Connection Pooling** - HTTP keep-alive for LLM API
2. **Parallel Evaluation** - Concurrent rule processing
3. **Circuit Breaker** - Fast-fail on degraded services
4. **Configurable Timeouts** - Prevent request hanging

---

## 6. Scalability Requirements

### Current Capacity

| Metric | Value | Notes |
|--------|-------|-------|
| Concurrent requests | 10-50 | Limited by LLM API rate limits |
| Requests per second | 5-20 | Depends on policy complexity |
| Max rules per policy | 50+ | Practical limit, not enforced |
| Max content size | ~32KB | LLM context window limit |

### Scaling Factors

**Horizontal Scaling:**
- Stateless server design enables horizontal scaling
- MongoDB supports replica sets
- Load balancer can distribute requests

**LLM API Limits:**
```
OpenAI Rate Limits (example - varies by tier):
- TPM (Tokens Per Minute): 90,000 - 10,000,000
- RPM (Requests Per Minute): 500 - 10,000
```

### Scaling Recommendations

| Scale | Configuration |
|-------|---------------|
| Low (< 100 req/day) | Single instance, local MongoDB |
| Medium (< 10,000 req/day) | 2-3 instances, MongoDB replica set |
| High (> 10,000 req/day) | Kubernetes, MongoDB Atlas, caching layer |

### Bottleneck Mitigation

1. **LLM API Rate Limits**
   - Circuit breaker prevents cascade failures
   - Exponential backoff reduces burst pressure
   - Consider multiple API keys for distribution

2. **Database Load**
   - History writes are async (non-blocking)
   - Indexes on common query fields
   - TTL indexes for automatic cleanup

3. **Memory Usage**
   - Connection pooling limits socket count
   - Stream large responses when possible
   - Configure appropriate Node.js memory limits

### Future Scalability Enhancements

- Result caching for repeated content
- Queue-based evaluation for high throughput
- Batch evaluation API
- Redis for distributed rate limiting
- Multiple LLM provider support for failover

