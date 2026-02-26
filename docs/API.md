# API Reference

Complete REST API documentation for Trustwise Policy Engine.

**Base URL:** `http://localhost:3002`

**Swagger UI:** `http://localhost:3002/api-docs`

---

## Table of Contents

- [Authentication](#authentication)
- [Evaluation Endpoints](#evaluation-endpoints)
- [Configuration Endpoints](#configuration-endpoints)
- [Rule Management](#rule-management)
- [History Endpoints](#history-endpoints)
- [Health & Utility](#health--utility)
- [Error Responses](#error-responses)

---

## Authentication

Currently, Trustwise does not require authentication for API endpoints. For production use, implement authentication middleware (JWT, API keys, etc.).

---

## Rate limiting

API requests are **rate-limited by client IP**. All endpoints under `/api` share the same limit.

- **Default:** 60 requests per IP per 1-minute window.
- **When exceeded:** the server responds with **429 Too Many Requests** and a JSON body, e.g.:

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Maximum 60 requests per 60 seconds per IP.",
  "retryAfter": 60
}
```

**Configuration:** See [API rate limiting (IP-based)](NON_FUNCTIONAL_REQUIREMENTS.md#api-rate-limiting-ip-based) in Non-Functional Requirements. Use `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_PER_WINDOW` to tune; set `TRUST_PROXY=1` when behind a reverse proxy so the client IP is correct.

---

## Evaluation Endpoints

### Evaluate Content

Evaluate content against the configured policy.

```http
POST /api/policy/evaluate
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `content` | string | Yes | Content to evaluate |
| `policy` | object | No | Override policy for this request |

**Example Request:**

```json
{
  "content": "This is the text content to evaluate for policy compliance.",
  "policy": null
}
```

**Response:**

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
    }
  ],
  "summary": {
    "strategy": "all",
    "total_rules": 1,
    "passed": 1,
    "failed": 0,
    "uncertain": 0,
    "reason": "All rules passed"
  },
  "total_latency_ms": 456
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Evaluation completed |
| 400 | Invalid request (missing content or invalid policy) |
| 500 | Server error |

---

## Configuration Endpoints

### Get Configuration

Retrieve current policy configuration.

```http
GET /api/policy/config
```

**Response:**

```json
{
  "policy": {
    "name": "content_safety_policy",
    "version": "1.0.0",
    "default_action": "warn",
    "evaluation_strategy": "all",
    "threshold": 0.7,
    "rules": [
      {
        "id": "no_hate_speech",
        "description": "Detect and prevent hate speech",
        "judge_prompt": "Evaluate if the content contains hate speech...",
        "on_fail": "block",
        "weight": 1.0
      }
    ]
  },
  "judge": {
    "model": "gpt-4o-mini",
    "temperature": 0.1,
    "maxTokens": 500,
    "timeout": 30000,
    "maxRetries": 3,
    "retryDelay": 1000
  },
  "settings": {
    "parallelEvaluation": true,
    "debugLog": false,
    "cacheResults": false
  }
}
```

### Update Configuration

Update policy, judge, or settings configuration.

```http
POST /api/policy/config
Content-Type: application/json
```

**Request Body:**

```json
{
  "policy": {
    "name": "updated_policy",
    "evaluation_strategy": "weighted_threshold",
    "threshold": 0.8
  },
  "judge": {
    "model": "gpt-4o",
    "temperature": 0.2
  },
  "settings": {
    "parallelEvaluation": true
  }
}
```

**Response:**

```json
{
  "success": true,
  "message": "Configuration updated and saved to MongoDB",
  "config": { /* updated configuration */ }
}
```

### Reload Configuration

Reload configuration from MongoDB.

```http
POST /api/policy/config/reload
```

**Response:**

```json
{
  "success": true,
  "message": "Configuration reloaded from MongoDB",
  "config": { /* current configuration */ }
}
```

### Reset Configuration

Reset configuration to default values.

```http
POST /api/policy/config/reset
```

**Response:**

```json
{
  "success": true,
  "message": "Configuration reset to default values",
  "config": { /* default configuration */ }
}
```

---

## Rule Management

### Add Rule

Add a new rule to the policy.

```http
POST /api/policy/rules
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique rule identifier |
| `description` | string | No | Human-readable description |
| `judge_prompt` | string | Yes | LLM evaluation prompt |
| `on_fail` | string | No | Action on fail: `allow`, `block`, `warn`, `redact` |
| `weight` | number | No | Rule weight 0-1 (default: 1.0) |

**Example Request:**

```json
{
  "id": "no_profanity",
  "description": "Detect and flag profane language",
  "judge_prompt": "Evaluate if the content contains profanity, vulgar language, or inappropriate expressions.",
  "on_fail": "warn",
  "weight": 0.8
}
```

**Response:**

```json
{
  "success": true,
  "message": "Rule added successfully and saved to MongoDB",
  "rule": {
    "id": "no_profanity",
    "description": "Detect and flag profane language",
    "judge_prompt": "Evaluate if the content contains profanity...",
    "on_fail": "warn",
    "weight": 0.8
  },
  "config": { /* updated configuration */ }
}
```

### Update Rule

Update an existing rule.

```http
PUT /api/policy/rules/:ruleId
Content-Type: application/json
```

**URL Parameters:**

| Parameter | Description |
|-----------|-------------|
| `ruleId` | Rule identifier to update |

**Request Body:**

```json
{
  "description": "Updated description",
  "on_fail": "block",
  "weight": 0.9
}
```

**Response:**

```json
{
  "success": true,
  "message": "Rule updated successfully and saved to MongoDB",
  "rule": { /* updated rule */ },
  "config": { /* updated configuration */ }
}
```

### Delete Rule

Delete a rule from the policy.

```http
DELETE /api/policy/rules/:ruleId
```

**Response:**

```json
{
  "success": true,
  "message": "Rule deleted successfully and saved to MongoDB",
  "config": { /* updated configuration */ }
}
```

---

## History Endpoints

### List History

List evaluation history with pagination and filters.

```http
GET /api/history
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `limit` | number | 20 | Items per page (max: 100) |
| `policyName` | string | - | Filter by policy name |
| `verdict` | string | - | Filter by verdict: ALLOW, BLOCK, WARN, REDACT, ERROR |
| `startDate` | string | - | Filter from date (ISO format) |
| `endDate` | string | - | Filter to date (ISO format) |
| `tags` | string | - | Filter by tags (comma-separated) |
| `search` | string | - | Search content/policy name |

**Example Request:**

```http
GET /api/history?page=1&limit=20&verdict=BLOCK&search=hate
```

**Response:**

```json
{
  "items": [
    {
      "evaluationId": "a1b2c3d4-...",
      "content": "Content text...",
      "policySnapshot": { /* policy at evaluation time */ },
      "result": { /* evaluation result */ },
      "metadata": {
        "evaluatedAt": "2025-12-03T10:30:00.000Z",
        "tags": ["production"],
        "notes": null,
        "environment": "production"
      }
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Get Statistics

Get aggregated evaluation statistics.

```http
GET /api/history/stats
```

**Response:**

```json
{
  "totalEvaluations": 1250,
  "verdictCounts": {
    "ALLOW": 1050,
    "BLOCK": 120,
    "WARN": 65,
    "REDACT": 10,
    "ERROR": 5
  },
  "recentEvaluations": 45,
  "uniquePolicies": 3
}
```

### Get Single Evaluation

Get details of a specific evaluation.

```http
GET /api/history/:evaluationId
```

**Response:**

```json
{
  "evaluationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "content": "Original content that was evaluated",
  "policySnapshot": {
    "name": "content_safety_policy",
    "version": "1.0.0",
    "rules": [...],
    "evaluation_strategy": "all"
  },
  "result": {
    "final_verdict": "ALLOW",
    "passed": true,
    "rule_results": [...],
    "summary": {...},
    "total_latency_ms": 456
  },
  "metadata": {
    "evaluatedAt": "2025-12-03T10:30:00.000Z",
    "tags": [],
    "notes": null,
    "environment": "development"
  }
}
```

### Re-run Evaluation

Re-run an evaluation with the original policy and content.

```http
POST /api/history/:evaluationId/rerun
Content-Type: application/json
```

**Request Body:**

```json
{
  "saveToHistory": true
}
```

**Response:**

```json
{
  "success": true,
  "originalEvaluationId": "a1b2c3d4-...",
  "newEvaluationId": "e5f6g7h8-...",
  "result": { /* new evaluation result */ }
}
```

### Delete Evaluation

Delete an evaluation from history.

```http
DELETE /api/history/:evaluationId
```

**Response:**

```json
{
  "success": true,
  "message": "Evaluation 'a1b2c3d4-...' deleted successfully"
}
```

### Batch Delete

Delete multiple evaluations.

```http
DELETE /api/history/batch
Content-Type: application/json
```

**Request Body:**

```json
{
  "evaluationIds": ["id1", "id2", "id3"]
}
```

**Response:**

```json
{
  "success": true,
  "message": "3 evaluation(s) deleted",
  "deletedCount": 3,
  "requestedCount": 3
}
```

### Update Tags

Update tags for an evaluation.

```http
PATCH /api/history/:evaluationId/tags
Content-Type: application/json
```

**Request Body:**

```json
{
  "tags": ["reviewed", "approved", "production"]
}
```

### Update Notes

Add or update notes for an evaluation.

```http
PATCH /api/history/:evaluationId/notes
Content-Type: application/json
```

**Request Body:**

```json
{
  "notes": "Reviewed by admin on 2025-12-03. False positive."
}
```

---

## Health & Utility

### Health Check

Check system health including database and LLM service status.

```http
GET /api/policy/health
```

**Response:**

```json
{
  "healthy": true,
  "engine": {
    "policyName": "content_safety_policy",
    "rulesCount": 3,
    "strategy": "all",
    "parallelEvaluation": true
  },
  "judge": {
    "healthy": true,
    "mode": "live",
    "model": "gpt-4o-mini",
    "circuitState": "CLOSED",
    "metrics": {
      "requests": 150,
      "successes": 148,
      "failures": 2,
      "retries": 5,
      "timeouts": 1,
      "rateLimits": 0,
      "circuitBreakerTrips": 0,
      "totalLatency": 36500,
      "averageLatency": "243.33ms",
      "successRate": "98.67%",
      "circuitFailureCount": 0,
      "isRateLimited": false
    }
  },
  "availableStrategies": ["all", "any", "weighted_threshold"],
  "database": {
    "connected": true
  }
}
```

### Validate Policy

Validate a policy configuration without applying it.

```http
POST /api/policy/validate
Content-Type: application/json
```

**Request Body:**

```json
{
  "policy": {
    "name": "test_policy",
    "rules": [
      {
        "id": "rule_1",
        "judge_prompt": "Test prompt"
      }
    ],
    "evaluation_strategy": "all"
  }
}
```

**Response (Valid):**

```json
{
  "valid": true,
  "errors": [],
  "warnings": []
}
```

**Response (Invalid):**

```json
{
  "valid": false,
  "errors": [
    "Policy name is required",
    "Rule 1: judge_prompt is required"
  ],
  "warnings": [
    "Rule 2: weight should be between 0 and 1"
  ]
}
```

### Root Endpoint

Get API overview and available endpoints.

```http
GET /
```

### API Documentation

Get JSON API documentation.

```http
GET /api/docs
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error Type",
  "message": "Human-readable error description",
  "errors": ["Detailed error 1", "Detailed error 2"],
  "warnings": ["Warning 1"]
}
```

### HTTP Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 429 | Too Many Requests - API rate limit exceeded (per-IP; see [Rate limiting](#rate-limiting)) |
| 500 | Internal Server Error |
| 503 | Service Unavailable - Health check failed |

### Common Errors

**400 Bad Request:**

```json
{
  "error": "Bad Request",
  "message": "content is required and must be a string"
}
```

**404 Not Found:**

```json
{
  "error": "Not Found",
  "message": "Rule with id 'nonexistent' not found"
}
```

**500 Internal Server Error:**

```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed"
}
```

