/**
 * Swagger Configuration
 * 
 * OpenAPI 3.0 specification for Trustwise API
 */

import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Trustwise - Policy Engine API',
      version: '1.0.0',
      description: `
## Overview

Trustwise is a configurable content moderation system that evaluates requests against rules using LLM-powered judges.

### Features
- **LLM-Powered Evaluation**: Uses OpenAI GPT models to intelligently evaluate content
- **Configurable Policies**: Define policies with multiple rules and evaluation strategies
- **Multiple Strategies**: \`all\`, \`any\`, \`weighted_threshold\`
- **Evaluation History**: Track and replay past evaluations
- **Circuit Breaker**: Graceful degradation for LLM service issues

### Evaluation Strategies
| Strategy | Description |
|----------|-------------|
| \`all\` | All rules must pass |
| \`any\` | At least one rule must pass |
| \`weighted_threshold\` | Weighted sum must exceed threshold |

### Final Verdicts
| Verdict | Description |
|---------|-------------|
| \`ALLOW\` | Content passed evaluation |
| \`BLOCK\` | Content rejected |
| \`WARN\` | Content allowed with warning |
| \`REDACT\` | Content needs redaction |
| \`ERROR\` | Evaluation failed |
      `,
      contact: {
        name: 'Trustwise Support',
      },
      license: {
        name: 'ISC',
      },
    },
    servers: [
      {
        url: 'http://localhost:3002',
        description: 'Development server',
      },
    ],
    tags: [
      {
        name: 'Evaluation',
        description: 'Content evaluation endpoints',
      },
      {
        name: 'Configuration',
        description: 'Policy configuration management',
      },
      {
        name: 'Rules',
        description: 'Rule CRUD operations',
      },
      {
        name: 'History',
        description: 'Evaluation history management',
      },
      {
        name: 'Health',
        description: 'Health check and utility endpoints',
      },
    ],
    components: {
      schemas: {
        // Core Types
        Verdict: {
          type: 'string',
          enum: ['PASS', 'FAIL', 'UNCERTAIN'],
          description: 'Individual rule verdict',
        },
        FinalVerdict: {
          type: 'string',
          enum: ['ALLOW', 'BLOCK', 'WARN', 'REDACT', 'ERROR'],
          description: 'Final policy verdict',
        },
        Action: {
          type: 'string',
          enum: ['allow', 'block', 'warn', 'redact'],
          description: 'Action to take on rule failure',
        },
        EvaluationStrategy: {
          type: 'string',
          enum: ['all', 'any', 'weighted_threshold'],
          description: 'Strategy for aggregating rule results',
        },

        // Rule Schema
        Rule: {
          type: 'object',
          required: ['id', 'judge_prompt', 'on_fail'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique rule identifier',
              example: 'no_hate_speech',
            },
            description: {
              type: 'string',
              description: 'Human-readable description',
              example: 'Detect and prevent hate speech',
            },
            judge_prompt: {
              type: 'string',
              description: 'LLM evaluation prompt',
              example: 'Evaluate if the content contains hate speech, discrimination, or harmful stereotypes.',
            },
            on_fail: {
              $ref: '#/components/schemas/Action',
            },
            weight: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Rule weight for scoring',
              example: 1.0,
            },
          },
        },

        // Rule Input
        RuleInput: {
          type: 'object',
          required: ['id', 'judge_prompt'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique rule identifier',
            },
            description: {
              type: 'string',
            },
            judge_prompt: {
              type: 'string',
            },
            on_fail: {
              $ref: '#/components/schemas/Action',
            },
            weight: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
          },
        },

        // Policy Schema
        Policy: {
          type: 'object',
          required: ['name', 'default_action', 'rules', 'evaluation_strategy'],
          properties: {
            name: {
              type: 'string',
              description: 'Policy name',
              example: 'content_safety_policy',
            },
            version: {
              type: 'string',
              description: 'Policy version',
              example: '1.0.0',
            },
            default_action: {
              $ref: '#/components/schemas/Action',
            },
            rules: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Rule',
              },
            },
            evaluation_strategy: {
              $ref: '#/components/schemas/EvaluationStrategy',
            },
            threshold: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Threshold for weighted_threshold strategy',
              example: 0.7,
            },
          },
        },

        // Judge Config
        JudgeConfig: {
          type: 'object',
          properties: {
            model: {
              type: 'string',
              example: 'gpt-4o-mini',
            },
            temperature: {
              type: 'number',
              example: 0.1,
            },
            maxTokens: {
              type: 'integer',
              example: 500,
            },
            timeout: {
              type: 'integer',
              example: 30000,
            },
            maxRetries: {
              type: 'integer',
              example: 3,
            },
            retryDelay: {
              type: 'integer',
              example: 1000,
            },
          },
        },

        // Engine Settings
        EngineSettings: {
          type: 'object',
          properties: {
            parallelEvaluation: {
              type: 'boolean',
              example: true,
            },
            debugLog: {
              type: 'boolean',
              example: false,
            },
            cacheResults: {
              type: 'boolean',
              example: false,
            },
          },
        },

        // Full Config
        Config: {
          type: 'object',
          properties: {
            policy: {
              $ref: '#/components/schemas/Policy',
            },
            judge: {
              $ref: '#/components/schemas/JudgeConfig',
            },
            settings: {
              $ref: '#/components/schemas/EngineSettings',
            },
          },
        },

        // Rule Result
        RuleResult: {
          type: 'object',
          properties: {
            rule_id: {
              type: 'string',
            },
            verdict: {
              $ref: '#/components/schemas/Verdict',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
            },
            reasoning: {
              type: 'string',
            },
            action: {
              $ref: '#/components/schemas/Action',
            },
            weight: {
              type: 'number',
            },
            latency_ms: {
              type: 'integer',
            },
          },
        },

        // Aggregation Summary
        AggregationSummary: {
          type: 'object',
          properties: {
            strategy: {
              $ref: '#/components/schemas/EvaluationStrategy',
            },
            total_rules: {
              type: 'integer',
            },
            passed: {
              type: 'integer',
            },
            failed: {
              type: 'integer',
            },
            uncertain: {
              type: 'integer',
            },
            reason: {
              type: 'string',
            },
            score: {
              type: 'number',
              description: 'For weighted_threshold strategy',
            },
            threshold: {
              type: 'number',
              description: 'For weighted_threshold strategy',
            },
          },
        },

        // Policy Verdict (Evaluation Response)
        PolicyVerdict: {
          type: 'object',
          properties: {
            policy_name: {
              type: 'string',
            },
            policy_version: {
              type: 'string',
            },
            final_verdict: {
              $ref: '#/components/schemas/FinalVerdict',
            },
            passed: {
              type: 'boolean',
            },
            evaluated_at: {
              type: 'string',
              format: 'date-time',
            },
            evaluationId: {
              type: 'string',
              format: 'uuid',
            },
            rule_results: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/RuleResult',
              },
            },
            summary: {
              $ref: '#/components/schemas/AggregationSummary',
            },
            error: {
              type: 'string',
            },
            total_latency_ms: {
              type: 'integer',
            },
          },
        },

        // Evaluation History
        EvaluationHistory: {
          type: 'object',
          properties: {
            evaluationId: {
              type: 'string',
              format: 'uuid',
            },
            content: {
              type: 'string',
            },
            policySnapshot: {
              $ref: '#/components/schemas/Policy',
            },
            result: {
              type: 'object',
              properties: {
                final_verdict: {
                  $ref: '#/components/schemas/FinalVerdict',
                },
                passed: {
                  type: 'boolean',
                },
                rule_results: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/RuleResult',
                  },
                },
                summary: {
                  $ref: '#/components/schemas/AggregationSummary',
                },
                total_latency_ms: {
                  type: 'integer',
                },
              },
            },
            metadata: {
              type: 'object',
              properties: {
                evaluatedAt: {
                  type: 'string',
                  format: 'date-time',
                },
                tags: {
                  type: 'array',
                  items: {
                    type: 'string',
                  },
                },
                notes: {
                  type: 'string',
                },
                environment: {
                  type: 'string',
                },
              },
            },
          },
        },

        // History List Response
        HistoryListResponse: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/EvaluationHistory',
              },
            },
            total: {
              type: 'integer',
            },
            page: {
              type: 'integer',
            },
            limit: {
              type: 'integer',
            },
            totalPages: {
              type: 'integer',
            },
          },
        },

        // History Stats
        HistoryStats: {
          type: 'object',
          properties: {
            totalEvaluations: {
              type: 'integer',
            },
            verdictCounts: {
              type: 'object',
              properties: {
                ALLOW: { type: 'integer' },
                BLOCK: { type: 'integer' },
                WARN: { type: 'integer' },
                REDACT: { type: 'integer' },
                ERROR: { type: 'integer' },
              },
            },
            recentEvaluations: {
              type: 'integer',
            },
            uniquePolicies: {
              type: 'integer',
            },
          },
        },

        // Health Check Response
        HealthCheck: {
          type: 'object',
          properties: {
            healthy: {
              type: 'boolean',
            },
            engine: {
              type: 'object',
              properties: {
                policyName: { type: 'string' },
                rulesCount: { type: 'integer' },
                strategy: { $ref: '#/components/schemas/EvaluationStrategy' },
                parallelEvaluation: { type: 'boolean' },
              },
            },
            judge: {
              type: 'object',
              properties: {
                healthy: { type: 'boolean' },
                mode: { type: 'string', enum: ['mock', 'live'] },
                model: { type: 'string' },
                circuitState: { type: 'string', enum: ['CLOSED', 'OPEN', 'HALF_OPEN'] },
                metrics: {
                  type: 'object',
                  properties: {
                    requests: { type: 'integer' },
                    successes: { type: 'integer' },
                    failures: { type: 'integer' },
                    averageLatency: { type: 'string' },
                    successRate: { type: 'string' },
                  },
                },
              },
            },
            availableStrategies: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/EvaluationStrategy',
              },
            },
            database: {
              type: 'object',
              properties: {
                connected: { type: 'boolean' },
              },
            },
          },
        },

        // Validation Result
        ValidationResult: {
          type: 'object',
          properties: {
            valid: {
              type: 'boolean',
            },
            errors: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            warnings: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },

        // Error Response
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
            message: {
              type: 'string',
            },
            errors: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            warnings: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
          },
        },

        // Success Response
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            message: {
              type: 'string',
            },
          },
        },
      },
    },
    paths: {
      // ========== Evaluation ==========
      '/api/policy/evaluate': {
        post: {
          tags: ['Evaluation'],
          summary: 'Evaluate content against policy',
          description: 'Evaluate content against the configured policy using LLM judges',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['content'],
                  properties: {
                    content: {
                      type: 'string',
                      description: 'Content to evaluate',
                      example: 'This is sample text to evaluate for policy compliance.',
                    },
                    policy: {
                      $ref: '#/components/schemas/Policy',
                      description: 'Optional policy override',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Evaluation completed',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/PolicyVerdict',
                  },
                },
              },
            },
            400: {
              description: 'Invalid request',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
            500: {
              description: 'Server error',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },

      // ========== Configuration ==========
      '/api/policy/config': {
        get: {
          tags: ['Configuration'],
          summary: 'Get current configuration',
          description: 'Retrieve current policy, judge, and engine settings',
          responses: {
            200: {
              description: 'Configuration retrieved',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/Config',
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Configuration'],
          summary: 'Update configuration',
          description: 'Update policy, judge, or settings configuration',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    policy: {
                      type: 'object',
                      description: 'Policy updates',
                    },
                    judge: {
                      type: 'object',
                      description: 'Judge configuration updates',
                    },
                    settings: {
                      type: 'object',
                      description: 'Engine settings updates',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Configuration updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      config: { $ref: '#/components/schemas/Config' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid configuration',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/policy/config/reload': {
        post: {
          tags: ['Configuration'],
          summary: 'Reload configuration',
          description: 'Reload configuration from MongoDB',
          responses: {
            200: {
              description: 'Configuration reloaded',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      config: { $ref: '#/components/schemas/Config' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/api/policy/config/reset': {
        post: {
          tags: ['Configuration'],
          summary: 'Reset configuration',
          description: 'Reset configuration to default values',
          responses: {
            200: {
              description: 'Configuration reset',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      config: { $ref: '#/components/schemas/Config' },
                    },
                  },
                },
              },
            },
          },
        },
      },

      // ========== Rules ==========
      '/api/policy/rules': {
        post: {
          tags: ['Rules'],
          summary: 'Add a new rule',
          description: 'Add a new rule to the policy',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/RuleInput',
                },
                example: {
                  id: 'no_profanity',
                  description: 'Detect profane language',
                  judge_prompt: 'Evaluate if the content contains profanity or vulgar language.',
                  on_fail: 'warn',
                  weight: 0.8,
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Rule added',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      message: { type: 'string' },
                      rule: { $ref: '#/components/schemas/Rule' },
                      config: { $ref: '#/components/schemas/Config' },
                    },
                  },
                },
              },
            },
            400: {
              description: 'Invalid rule',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ErrorResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/policy/rules/{ruleId}': {
        put: {
          tags: ['Rules'],
          summary: 'Update a rule',
          description: 'Update an existing rule',
          parameters: [
            {
              name: 'ruleId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Rule identifier',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    judge_prompt: { type: 'string' },
                    on_fail: { $ref: '#/components/schemas/Action' },
                    weight: { type: 'number' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Rule updated',
            },
            404: {
              description: 'Rule not found',
            },
          },
        },
        delete: {
          tags: ['Rules'],
          summary: 'Delete a rule',
          description: 'Delete a rule from the policy',
          parameters: [
            {
              name: 'ruleId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Rule identifier',
            },
          ],
          responses: {
            200: {
              description: 'Rule deleted',
            },
            404: {
              description: 'Rule not found',
            },
          },
        },
      },

      // ========== History ==========
      '/api/history': {
        get: {
          tags: ['History'],
          summary: 'List evaluation history',
          description: 'List evaluation history with pagination and filters',
          parameters: [
            {
              name: 'page',
              in: 'query',
              schema: { type: 'integer', default: 1 },
              description: 'Page number',
            },
            {
              name: 'limit',
              in: 'query',
              schema: { type: 'integer', default: 20, maximum: 100 },
              description: 'Items per page',
            },
            {
              name: 'policyName',
              in: 'query',
              schema: { type: 'string' },
              description: 'Filter by policy name',
            },
            {
              name: 'verdict',
              in: 'query',
              schema: { $ref: '#/components/schemas/FinalVerdict' },
              description: 'Filter by verdict',
            },
            {
              name: 'startDate',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter from date',
            },
            {
              name: 'endDate',
              in: 'query',
              schema: { type: 'string', format: 'date-time' },
              description: 'Filter to date',
            },
            {
              name: 'search',
              in: 'query',
              schema: { type: 'string' },
              description: 'Search content/policy',
            },
          ],
          responses: {
            200: {
              description: 'History list',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HistoryListResponse',
                  },
                },
              },
            },
          },
        },
      },
      '/api/history/stats': {
        get: {
          tags: ['History'],
          summary: 'Get statistics',
          description: 'Get aggregated evaluation statistics',
          responses: {
            200: {
              description: 'Statistics retrieved',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HistoryStats',
                  },
                },
              },
            },
          },
        },
      },
      '/api/history/{evaluationId}': {
        get: {
          tags: ['History'],
          summary: 'Get evaluation',
          description: 'Get details of a specific evaluation',
          parameters: [
            {
              name: 'evaluationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Evaluation ID',
            },
          ],
          responses: {
            200: {
              description: 'Evaluation details',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/EvaluationHistory',
                  },
                },
              },
            },
            404: {
              description: 'Evaluation not found',
            },
          },
        },
        delete: {
          tags: ['History'],
          summary: 'Delete evaluation',
          description: 'Delete an evaluation from history',
          parameters: [
            {
              name: 'evaluationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Evaluation ID',
            },
          ],
          responses: {
            200: {
              description: 'Evaluation deleted',
            },
            404: {
              description: 'Evaluation not found',
            },
          },
        },
      },
      '/api/history/{evaluationId}/rerun': {
        post: {
          tags: ['History'],
          summary: 'Re-run evaluation',
          description: 'Re-run evaluation with original policy and content',
          parameters: [
            {
              name: 'evaluationId',
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: 'Evaluation ID to re-run',
            },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    saveToHistory: {
                      type: 'boolean',
                      default: true,
                      description: 'Save result to history',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Evaluation re-run',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      originalEvaluationId: { type: 'string' },
                      newEvaluationId: { type: 'string' },
                      result: { $ref: '#/components/schemas/PolicyVerdict' },
                    },
                  },
                },
              },
            },
            404: {
              description: 'Original evaluation not found',
            },
          },
        },
      },

      // ========== Health ==========
      '/api/policy/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          description: 'Check system health including database and LLM service',
          responses: {
            200: {
              description: 'System healthy',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HealthCheck',
                  },
                },
              },
            },
            503: {
              description: 'System unhealthy',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/HealthCheck',
                  },
                },
              },
            },
          },
        },
      },
      '/api/policy/validate': {
        post: {
          tags: ['Health'],
          summary: 'Validate policy',
          description: 'Validate a policy configuration without applying it',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['policy'],
                  properties: {
                    policy: {
                      $ref: '#/components/schemas/Policy',
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Validation result',
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/ValidationResult',
                  },
                },
              },
            },
          },
        },
      },
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Quick health check',
          description: 'Quick health check endpoint',
          responses: {
            200: {
              description: 'System healthy',
            },
            503: {
              description: 'System unhealthy',
            },
          },
        },
      },
    },
  },
  apis: [], // No JSDoc annotations needed, we define everything inline
};

export const swaggerSpec = swaggerJsdoc(options);

