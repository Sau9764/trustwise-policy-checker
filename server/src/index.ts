/**
 * Trustwise - Policy Engine with LLM Judges
 * 
 * A standalone server for content moderation using configurable policies
 * and LLM-powered rule evaluation.
 * 
 * All configuration and history is stored in MongoDB.
 */

import 'dotenv/config';
import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import { initialize } from './engine';
import { connectDatabase, getDatabaseStatus } from './config/database';

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

// Initialize Policy Engine (returns services and routes, but requires async init after DB connect)
const { policyEngine, routes, historyRoutes, initializeAsync } = initialize({ logger: console });

// Mount Policy Engine routes
app.use('/api/policy', routes);

// Mount History routes
app.use('/api/history', historyRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  const dbStatus = getDatabaseStatus();
  res.json({
    name: 'Trustwise - Policy Engine with LLM Judges',
    version: '1.0.0',
    description: 'A configurable content moderation system using LLM-powered judges',
    storage: 'MongoDB (all configuration and history stored in database)',
    endpoints: {
      // Evaluation
      evaluate: 'POST /api/policy/evaluate',
      
      // Configuration (MongoDB-backed)
      config: 'GET /api/policy/config',
      updateConfig: 'POST /api/policy/config',
      reloadConfig: 'POST /api/policy/config/reload',
      resetConfig: 'POST /api/policy/config/reset',
      
      // Rules (MongoDB-backed)
      addRule: 'POST /api/policy/rules',
      updateRule: 'PUT /api/policy/rules/:ruleId',
      deleteRule: 'DELETE /api/policy/rules/:ruleId',
      
      // Health & Validation
      health: 'GET /api/policy/health',
      validate: 'POST /api/policy/validate',
      
      // History (MongoDB-backed)
      history: 'GET /api/history',
      historyStats: 'GET /api/history/stats',
      getEvaluation: 'GET /api/history/:id',
      rerunEvaluation: 'POST /api/history/:id/rerun',
      deleteEvaluation: 'DELETE /api/history/:id'
    },
    database: {
      connected: dbStatus.connected,
      host: dbStatus.host,
      database: dbStatus.database,
    },
    documentation: '/api/docs'
  });
});

// API documentation endpoint
app.get('/api/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Trustwise Policy Engine API',
    version: '1.0.0',
    storage: 'All configuration and history is stored in MongoDB',
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
          total_latency_ms: 'number',
          evaluationId: 'string - ID for the saved evaluation history'
        }
      },
      {
        method: 'GET',
        path: '/api/policy/config',
        description: 'Get current policy configuration (from MongoDB)'
      },
      {
        method: 'POST',
        path: '/api/policy/config',
        description: 'Update policy configuration (saved to MongoDB)',
        body: {
          policy: 'object (optional) - Policy settings',
          judge: 'object (optional) - Judge settings',
          settings: 'object (optional) - Engine settings'
        }
      },
      {
        method: 'POST',
        path: '/api/policy/config/reload',
        description: 'Reload configuration from MongoDB'
      },
      {
        method: 'POST',
        path: '/api/policy/config/reset',
        description: 'Reset configuration to default values'
      },
      {
        method: 'GET',
        path: '/api/policy/health',
        description: 'Health check endpoint (includes MongoDB status)'
      },
      {
        method: 'POST',
        path: '/api/policy/validate',
        description: 'Validate a policy configuration without applying it',
        body: {
          policy: 'object (required) - Policy to validate'
        }
      },
      {
        method: 'POST',
        path: '/api/policy/rules',
        description: 'Add a new rule (saved to MongoDB)',
        body: {
          id: 'string (required) - Unique rule identifier',
          description: 'string (optional) - Rule description',
          judge_prompt: 'string (required) - Prompt for LLM judge',
          on_fail: 'string (optional) - Action on fail: allow|block|warn|redact',
          weight: 'number (optional) - Rule weight 0-1'
        }
      },
      {
        method: 'PUT',
        path: '/api/policy/rules/:ruleId',
        description: 'Update an existing rule (saved to MongoDB)'
      },
      {
        method: 'DELETE',
        path: '/api/policy/rules/:ruleId',
        description: 'Delete a rule (saved to MongoDB)'
      },
      {
        method: 'GET',
        path: '/api/history',
        description: 'List evaluation history with pagination',
        queryParams: {
          page: 'number (default: 1)',
          limit: 'number (default: 20, max: 100)',
          verdict: 'string - Filter by verdict',
          search: 'string - Search content/policy'
        }
      },
      {
        method: 'GET',
        path: '/api/history/stats',
        description: 'Get evaluation statistics'
      },
      {
        method: 'GET',
        path: '/api/history/:id',
        description: 'Get specific evaluation details'
      },
      {
        method: 'POST',
        path: '/api/history/:id/rerun',
        description: 'Re-run evaluation with original policy and content',
        body: {
          saveToHistory: 'boolean (default: true) - Save result to history'
        }
      },
      {
        method: 'DELETE',
        path: '/api/history/:id',
        description: 'Delete an evaluation from history'
      }
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
    const dbStatus = getDatabaseStatus();
    const statusCode = health.healthy && dbStatus.connected ? 200 : 503;
    res.status(statusCode).json({
      ...health,
      database: dbStatus
    });
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

const startServer = async () => {
  const openaiConfigured = !!process.env['OPENAI_API_KEY'];
  const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/trustwise';
  
  // Connect to MongoDB (required for the app to function)
  let mongoConnected = false;
  try {
    console.log('[Trustwise] Connecting to MongoDB...');
    await connectDatabase({ logger: console, uri: mongoUri });
    mongoConnected = true;
    
    // Initialize PolicyEngine with config from MongoDB
    await initializeAsync();
    
  } catch (error) {
    const err = error as Error;
    console.error('\n❌ MongoDB connection failed:', err.message);
    console.error('   The application requires MongoDB to function.');
    console.error('   Please ensure MongoDB is running and accessible.');
    console.error(`   Connection string: ${mongoUri}\n`);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║   Trustwise - Policy Engine with LLM Judges                ║
╠════════════════════════════════════════════════════════════╣
║   Port: ${PORT}                                              ║
║   URL: http://localhost:${PORT}/                              ║
║                                                            ║
║   OpenAI: ${openaiConfigured ? '[OK] Configured' : '[MISSING] Set OPENAI_API_KEY'}                       ║
║   MongoDB: ${mongoConnected ? '[OK] Connected' : '[ERR] Not Connected'}                        ║
║                                                            ║
║   Storage: All config & history in MongoDB                 ║
║                                                            ║
║   Endpoints:                                               ║
║   - POST /api/policy/evaluate  - Evaluate content          ║
║   - GET  /api/policy/config    - Get configuration         ║
║   - POST /api/policy/config    - Update configuration      ║
║   - GET  /api/policy/health    - Health check              ║
║   - GET  /api/history          - Evaluation history        ║
║   - GET  /api/docs             - API documentation         ║
╚════════════════════════════════════════════════════════════╝
    `);

    if (!openaiConfigured) {
      console.warn('\n⚠️  Warning: OPENAI_API_KEY is not set. LLM evaluation will fail.');
      console.warn('   Copy .env.example to .env and add your OpenAI API key.\n');
    }
  });
};

startServer();

export default app;
