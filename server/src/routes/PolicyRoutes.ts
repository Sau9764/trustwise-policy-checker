/**
 * PolicyRoutes - REST API endpoints for Policy Engine
 * 
 * Endpoints:
 * - POST /api/policy/evaluate - Evaluate content against policy
 * - GET /api/policy/config - Get current policy configuration
 * - POST /api/policy/config - Update policy configuration
 * - POST /api/policy/config/reload - Reload configuration from MongoDB
 * - POST /api/policy/config/reset - Reset configuration to default
 * - GET /api/policy/health - Health check endpoint
 * - POST /api/policy/validate - Validate a policy configuration
 * - POST /api/policy/rules - Add a new rule
 * - PUT /api/policy/rules/:ruleId - Update a rule
 * - DELETE /api/policy/rules/:ruleId - Delete a rule
 */

import { Router, Request, Response } from 'express';
import type {
  Logger,
  PolicyEngineInterface,
  PolicyRoutesOptions,
  EvaluateRequest,
  ConfigUpdateRequest,
  ValidateRequest,
  Policy,
  RuleInput
} from '../types';
import { HistoryService } from '../services/HistoryService';
import { ConfigService } from '../services/ConfigService';
import { PolicyEngine } from '../services/PolicyEngine';
import { isDatabaseConnected } from '../config/database';

export interface PolicyRoutesExtendedOptions extends PolicyRoutesOptions {
  historyService?: HistoryService;
  configService?: ConfigService;
}

/**
 * Create policy routes
 */
export const createPolicyRoutes = (
  policyEngine: PolicyEngineInterface,
  options: PolicyRoutesExtendedOptions = {}
): Router => {
  const router = Router();
  const logger: Logger = options.logger || console;
  const historyService = options.historyService;
  const configService = options.configService;

  /**
   * POST /api/policy/evaluate
   * Evaluate content against the configured policy
   */
  router.post('/evaluate', async (req: Request<object, unknown, EvaluateRequest>, res: Response): Promise<void> => {
    try {
      const { content, policy } = req.body;

      if (!content || typeof content !== 'string') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'content is required and must be a string'
        });
        return;
      }

      // Validate policy if provided
      if (policy) {
        const validation = policyEngine.validatePolicy(policy);
        if (!validation.valid) {
          res.status(400).json({
            error: 'Invalid Policy',
            message: 'Provided policy configuration is invalid',
            errors: validation.errors,
            warnings: validation.warnings
          });
          return;
        }
      }

      logger.info('[PolicyRoutes] Evaluate request received', {
        contentLength: content.length,
        hasCustomPolicy: !!policy
      });

      // Get the active policy for saving to history
      const activePolicy = policy ? (policy as Policy) : policyEngine.getActivePolicy();
      
      const verdict = await policyEngine.evaluate(content, { policy: policy as Policy });

      // Save to history if database is connected and historyService is available
      let evaluationId: string | undefined;
      if (historyService && isDatabaseConnected()) {
        try {
          const historyRecord = await historyService.create({
            content,
            policy: activePolicy,
            result: verdict,
          });
          evaluationId = historyRecord.evaluationId;
          logger.info('[PolicyRoutes] Evaluation saved to history', { evaluationId });
        } catch (historyError) {
          const hErr = historyError as Error;
          logger.warn('[PolicyRoutes] Failed to save evaluation to history', {
            error: hErr.message,
          });
          // Don't fail the request if history save fails
        }
      }

      res.json({
        ...verdict,
        evaluationId,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Evaluation error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * GET /api/policy/config
   * Get current policy configuration
   */
  router.get('/config', (_req: Request, res: Response): void => {
    try {
      const config = policyEngine.getConfig();
      res.json(config);
    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Get config error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * POST /api/policy/config
   * Update policy configuration (saved to MongoDB)
   */
  router.post('/config', async (req: Request<object, unknown, ConfigUpdateRequest>, res: Response): Promise<void> => {
    try {
      const newConfig = req.body;

      if (!newConfig || Object.keys(newConfig).length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Configuration object is required'
        });
        return;
      }

      // Validate policy section if provided
      if (newConfig.policy) {
        const mergedPolicy = {
          ...policyEngine.getConfig().policy,
          ...newConfig.policy
        };
        const validation = policyEngine.validatePolicy(mergedPolicy);
        if (!validation.valid) {
          res.status(400).json({
            error: 'Invalid Configuration',
            message: 'Policy configuration is invalid',
            errors: validation.errors,
            warnings: validation.warnings
          });
          return;
        }
      }

      logger.info('[PolicyRoutes] Config update request', {
        sections: Object.keys(newConfig)
      });

      // Use async method for MongoDB persistence
      const updatedConfig = await (policyEngine as PolicyEngine).updateConfigAsync(
        newConfig as Parameters<typeof policyEngine.updateConfig>[0]
      );

      res.json({
        success: true,
        message: 'Configuration updated and saved to MongoDB',
        config: updatedConfig
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Update config error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * POST /api/policy/config/reload
   * Reload configuration from MongoDB
   */
  router.post('/config/reload', async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[PolicyRoutes] Config reload request');

      const config = await (policyEngine as PolicyEngine).reloadConfigAsync();

      res.json({
        success: true,
        message: 'Configuration reloaded from MongoDB',
        config
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Reload config error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * POST /api/policy/config/reset
   * Reset configuration to default values
   */
  router.post('/config/reset', async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[PolicyRoutes] Config reset to default request');

      const config = await (policyEngine as PolicyEngine).resetToDefault();

      res.json({
        success: true,
        message: 'Configuration reset to default values',
        config
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Reset config error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * GET /api/policy/health
   * Health check endpoint
   */
  router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    try {
      const health = await policyEngine.healthCheck();

      const statusCode = health.healthy ? 200 : 503;
      res.status(statusCode).json({
        ...health,
        database: {
          connected: isDatabaseConnected()
        }
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Health check error', {
        error: err.message
      });

      res.status(503).json({
        healthy: false,
        error: err.message
      });
    }
  });

  /**
   * POST /api/policy/validate
   * Validate a policy configuration without applying it
   */
  router.post('/validate', (req: Request<object, unknown, ValidateRequest>, res: Response): void => {
    try {
      const { policy } = req.body;

      if (!policy) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'policy object is required'
        });
        return;
      }

      const validation = policyEngine.validatePolicy(policy);

      res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Validation error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * POST /api/policy/rules
   * Add a new rule to the policy (saved to MongoDB)
   */
  router.post('/rules', async (req: Request<object, unknown, RuleInput>, res: Response): Promise<void> => {
    try {
      const rule = req.body;

      if (!rule || !rule.id || !rule.judge_prompt) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Rule must have id and judge_prompt fields'
        });
        return;
      }

      logger.info('[PolicyRoutes] Add rule request', { ruleId: rule.id });

      const result = await (policyEngine as PolicyEngine).addRuleAsync(rule);

      if (!result.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule added successfully and saved to MongoDB',
        rule: result.rule,
        config: policyEngine.getConfig()
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Add rule error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * PUT /api/policy/rules/:ruleId
   * Update an existing rule (saved to MongoDB)
   */
  router.put('/rules/:ruleId', async (req: Request<{ ruleId: string }, unknown, Partial<RuleInput>>, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;
      const updates = req.body;

      if (!updates || Object.keys(updates).length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Update data is required'
        });
        return;
      }

      logger.info('[PolicyRoutes] Update rule request', { ruleId });

      const result = await (policyEngine as PolicyEngine).updateRuleAsync(ruleId, updates);

      if (!result.success) {
        res.status(404).json({
          error: 'Not Found',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule updated successfully and saved to MongoDB',
        rule: result.rule,
        config: policyEngine.getConfig()
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Update rule error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  /**
   * DELETE /api/policy/rules/:ruleId
   * Delete a rule from the policy (saved to MongoDB)
   */
  router.delete('/rules/:ruleId', async (req: Request<{ ruleId: string }>, res: Response): Promise<void> => {
    try {
      const { ruleId } = req.params;

      logger.info('[PolicyRoutes] Delete rule request', { ruleId });

      const result = await (policyEngine as PolicyEngine).deleteRuleAsync(ruleId);

      if (!result.success) {
        res.status(404).json({
          error: 'Not Found',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule deleted successfully and saved to MongoDB',
        config: policyEngine.getConfig()
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[PolicyRoutes] Delete rule error', {
        error: err.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    }
  });

  return router;
};
