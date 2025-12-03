# Trustwise - Policy Engine with LLM Judges

A configurable Policy Engine that evaluates content against rules using LLM Judges. Each rule is evaluated by an OpenAI-powered LLM "Judge," which determines whether it passes, fails, or requires escalation.

## Features

- **Configurable Policies**: Define policies with multiple rules in JSON format
- **LLM Judges**: Each rule is evaluated by an OpenAI-powered LLM Judge
- **Multiple Strategies**: Support for `all`, `any`, and `weighted_threshold` evaluation strategies
- **Parallel Evaluation**: Rules are evaluated in parallel for faster results
- **Retry & Timeout**: Built-in retry logic and configurable timeouts
- **Hot Reload**: Configuration can be updated at runtime via API
- **Mock Mode**: Built-in mock support for testing
- **RESTful API**: Full REST API for integration

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the environment example file and add your OpenAI API key:

```bash
cp env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=your_openai_api_key_here
```

### 3. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 4. Test the API

```bash
curl -X POST http://localhost:3002/api/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, this is a test message for content moderation."
  }'
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Server info and available endpoints |
| GET | `/api/docs` | API documentation |
| GET | `/health` | Health check |
| POST | `/api/policy/evaluate` | Evaluate content against policy |
| GET | `/api/policy/config` | Get current configuration |
| POST | `/api/policy/config` | Update configuration |
| POST | `/api/policy/config/reload` | Reload config from file |
| GET | `/api/policy/health` | Detailed health check |
| POST | `/api/policy/validate` | Validate a policy |
| GET | `/api/policy/strategies` | List available strategies |
| POST | `/api/policy/runtime` | Set runtime policy override |
| DELETE | `/api/policy/runtime` | Clear runtime policy |

## Evaluation Request

```bash
curl -X POST http://localhost:3002/api/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello, this is a test message for content moderation."
  }'
```

### With Custom Policy Override

```bash
curl -X POST http://localhost:3002/api/policy/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Content to evaluate",
    "policy": {
      "name": "custom_policy",
      "version": "1.0",
      "default_action": "block",
      "rules": [
        {
          "id": "custom_rule",
          "description": "Check for custom criteria",
          "judge_prompt": "Does this content meet custom criteria?",
          "on_fail": "block",
          "weight": 1.0
        }
      ],
      "evaluation_strategy": "all"
    }
  }'
```

## Response Format

```json
{
  "policy_name": "content_safety_policy",
  "final_verdict": "ALLOW",
  "passed": true,
  "evaluated_at": "2024-01-15T10:30:00Z",
  "rule_results": [
    {
      "rule_id": "no_hate_speech",
      "verdict": "PASS",
      "confidence": 0.95,
      "reasoning": "No hate speech detected",
      "action": "block",
      "weight": 1.0,
      "latency_ms": 234
    }
  ],
  "summary": {
    "total_rules": 3,
    "passed": 3,
    "failed": 0,
    "uncertain": 0,
    "strategy": "all",
    "reason": "All rules passed"
  },
  "total_latency_ms": 892
}
```

## Policy Configuration

Policies are defined in `src/policy-config.json`:

```json
{
  "policy": {
    "name": "content_safety_policy",
    "version": "1.0",
    "default_action": "block",
    "rules": [
      {
        "id": "no_hate_speech",
        "description": "Content must not contain hate speech or slurs",
        "judge_prompt": "Does this content contain hate speech, slurs, or discriminatory language? Respond with PASS if clean, FAIL if violation found.",
        "on_fail": "block",
        "weight": 1.0
      },
      {
        "id": "no_pii",
        "description": "Content must not expose personal identifiable information",
        "judge_prompt": "Does this content contain PII such as SSN, credit cards, phone numbers, or addresses? Respond PASS if none found, FAIL if PII detected.",
        "on_fail": "redact",
        "weight": 0.8
      },
      {
        "id": "professional_tone",
        "description": "Content should maintain professional tone",
        "judge_prompt": "Is this content written in a professional, respectful tone? Respond PASS if professional, FAIL if unprofessional.",
        "on_fail": "warn",
        "weight": 0.5
      }
    ],
    "evaluation_strategy": "all",
    "threshold": 0.7
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

## Evaluation Strategies

| Strategy | Behavior |
|----------|----------|
| `all` | All rules must pass for content to be allowed |
| `any` | At least one rule must pass for content to be allowed |
| `weighted_threshold` | Weighted sum of passed rules must exceed threshold |

### Strategy Examples

**All Strategy (default)**: Every rule must pass.
```json
{
  "evaluation_strategy": "all"
}
```

**Any Strategy**: At least one rule must pass.
```json
{
  "evaluation_strategy": "any"
}
```

**Weighted Threshold**: Weighted score must exceed threshold.
```json
{
  "evaluation_strategy": "weighted_threshold",
  "threshold": 0.7
}
```

## Verdicts and Actions

### Verdicts (from LLM Judge)

| Verdict | Description |
|---------|-------------|
| `PASS` | Content meets the rule criteria |
| `FAIL` | Content violates the rule criteria |
| `UNCERTAIN` | Cannot determine with confidence |

### Final Actions

| Action | Description |
|--------|-------------|
| `ALLOW` | Content is allowed |
| `BLOCK` | Content is blocked |
| `WARN` | Content is allowed with warning |
| `REDACT` | Content should be redacted |
| `ERROR` | Evaluation failed |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key (required) | - |
| `PORT` | Server port | `3002` |
| `POLICY_NAME` | Policy name override | From config |
| `POLICY_DEFAULT_ACTION` | Default action override | `block` |
| `POLICY_EVALUATION_STRATEGY` | Strategy override | `all` |
| `POLICY_THRESHOLD` | Threshold override | `0.7` |
| `POLICY_JUDGE_MODEL` | LLM model | `gpt-4o-mini` |
| `POLICY_JUDGE_TIMEOUT` | Request timeout (ms) | `30000` |
| `POLICY_PARALLEL_EVALUATION` | Enable parallel | `true` |

## Testing

Run the test suite:

```bash
npm test
```

The tests cover:
1. All rules pass → ALLOW
2. One critical rule fails → BLOCK  
3. Weighted policy passes despite one failure
4. LLM timeout handling
5. UNCERTAIN verdict handling
6. ANY strategy works correctly
7. Policy validation

## Project Structure

```
trustwise/
├── server.js                      # Main server entry point
├── package.json                   # Dependencies and scripts
├── env.example                    # Environment variables template
├── .gitignore                     # Git ignore file
├── README.md                      # This documentation
└── src/
    ├── index.js                   # Module entry point
    ├── policy-config.js           # Config loader
    ├── policy-config.json         # Default configuration
    ├── policy-config.default.json # Backup configuration
    ├── server/
    │   ├── PolicyEngine.js        # Main orchestrator
    │   ├── JudgeService.js        # LLM Judge abstraction
    │   └── AggregationStrategy.js # Strategy implementations
    ├── routes/
    │   └── PolicyRoutes.js        # REST API endpoints
    └── tests/
        └── PolicyEngine.test.js   # Unit tests
```

## Programmatic Usage

You can also use the PolicyEngine programmatically:

```javascript
const { initialize, PolicyEngine } = require('./src');

// Option 1: Use the initialize function
const { policyEngine, routes } = initialize({ logger: console });

// Evaluate content
const verdict = await policyEngine.evaluate('Content to evaluate');
console.log(verdict.final_verdict); // 'ALLOW', 'BLOCK', 'WARN', 'REDACT'

// Option 2: Create PolicyEngine directly
const engine = new PolicyEngine({
  logger: console,
  mockMode: false // set to true for testing
});

const result = await engine.evaluate('Some content');
```

### Mock Mode for Testing

```javascript
const engine = new PolicyEngine({
  logger: console,
  mockMode: true,
  mockResponses: {
    'rule_1': { verdict: 'PASS', confidence: 0.95, reasoning: 'Test pass' },
    'rule_2': { verdict: 'FAIL', confidence: 0.90, reasoning: 'Test fail' }
  }
});

const result = await engine.evaluate('Test content');
```

## License

ISC

