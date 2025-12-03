/**
 * Trustwise - Policy Engine with LLM Judges
 * 
 * A standalone server for content moderation using configurable policies
 * and LLM-powered rule evaluation.
 */

import 'dotenv/config';
import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import { initialize } from './engine';

const app: Application = express();

// Middleware - CORS configuration
const allowedOrigins: string[] = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
];

if (process.env['CLIENT_URL']) {
  allowedOrigins.push(process.env['CLIENT_URL']);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || process.env['NODE_ENV'] === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Policy Engine
const { policyEngine, routes } = initialize({ logger: console });

// Mount Policy Engine routes
app.use('/api/policy', routes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'Trustwise - Policy Engine with LLM Judges',
    version: '1.0.0',
    description: 'A configurable content moderation system using LLM-powered judges',
    endpoints: {
      evaluate: 'POST /api/policy/evaluate',
      config: 'GET /api/policy/config',
      updateConfig: 'POST /api/policy/config',
      reloadConfig: 'POST /api/policy/config/reload',
      health: 'GET /api/policy/health',
      validate: 'POST /api/policy/validate'
    },
    documentation: '/api/docs'
  });
});

// API documentation endpoint
app.get('/api/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Trustwise Policy Engine API',
    version: '1.0.0',
    endpoints: [
      {
        method: 'POST',
        path: '/api/policy/evaluate',
        description: 'Evaluate content against the configured policy',
        body: {
          content: 'string (required) - Content to evaluate',
          policy: 'object (optional) - Override policy for this request'
        },
        response: {
          policy_name: 'string',
          final_verdict: 'ALLOW | BLOCK | WARN | REDACT | ERROR',
          passed: 'boolean',
          evaluated_at: 'ISO timestamp',
          rule_results: 'array of rule evaluation results',
          summary: 'object with aggregation details',
          total_latency_ms: 'number'
        }
      },
      {
        method: 'GET',
        path: '/api/policy/config',
        description: 'Get current policy configuration'
      },
      {
        method: 'POST',
        path: '/api/policy/config',
        description: 'Update policy configuration',
        body: {
          policy: 'object (optional) - Policy settings',
          judge: 'object (optional) - Judge settings',
          settings: 'object (optional) - Engine settings'
        }
      },
      {
        method: 'POST',
        path: '/api/policy/config/reload',
        description: 'Reload configuration from file'
      },
      {
        method: 'GET',
        path: '/api/policy/health',
        description: 'Health check endpoint'
      },
      {
        method: 'POST',
        path: '/api/policy/validate',
        description: 'Validate a policy configuration without applying it',
        body: {
          policy: 'object (required) - Policy to validate'
        }
      },
    ],
    evaluationStrategies: {
      all: 'All rules must pass for content to be allowed',
      any: 'At least one rule must pass for content to be allowed',
      weighted_threshold: 'Weighted sum of passed rules must exceed threshold'
    },
    verdicts: {
      PASS: 'Rule passed - content meets criteria',
      FAIL: 'Rule failed - content violates criteria',
      UNCERTAIN: 'Cannot determine with confidence'
    },
    actions: {
      allow: 'Allow content to proceed',
      block: 'Block content from proceeding',
      warn: 'Allow with warning flag',
      redact: 'Allow but redact sensitive content'
    }
  });
});

// Health check endpoint (shortcut)
app.get('/health', async (_req: Request, res: Response) => {
  try {
    const health = await policyEngine.healthCheck();
    const statusCode = health.healthy ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    const err = error as Error;
    res.status(503).json({
      healthy: false,
      error: err.message
    });
  }
});

// Start server
const PORT = process.env['PORT'] || 3002;

app.listen(PORT, () => {
  const openaiConfigured = !!process.env['OPENAI_API_KEY'];
  
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Trustwise - Policy Engine with LLM Judges                ║
╠════════════════════════════════════════════════════════════╣
║   Port: ${PORT}                                              ║
║   URL: http://localhost:${PORT}/                              ║
║                                                            ║
║   OpenAI: ${openaiConfigured ? '[OK] Configured' : '[MISSING] Set OPENAI_API_KEY'}                       ║
║                                                            ║
║   Endpoints:                                               ║
║   - POST /api/policy/evaluate  - Evaluate content          ║
║   - GET  /api/policy/config    - Get configuration         ║
║   - GET  /api/policy/health    - Health check              ║
║   - GET  /api/docs             - API documentation         ║
╚════════════════════════════════════════════════════════════╝
  `);

  if (!openaiConfigured) {
    console.warn('\n⚠️  Warning: OPENAI_API_KEY is not set. LLM evaluation will fail.');
    console.warn('   Copy .env.example to .env and add your OpenAI API key.\n');
  }
});

export default app;

