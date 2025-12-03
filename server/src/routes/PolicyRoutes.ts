/**
 * PolicyRoutes - REST API endpoints for Policy Engine
 * 
 * Endpoints:
 * - POST /api/policy/evaluate - Evaluate content against policy
 * - GET /api/policy/config - Get current policy configuration
 * - POST /api/policy/config - Update policy configuration
 * - GET /api/policy/health - Health check endpoint
 * - POST /api/policy/validate - Validate a policy configuration
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

/**
 * Create policy routes
 */
export const createPolicyRoutes = (
  policyEngine: PolicyEngineInterface,
  options: PolicyRoutesOptions = {}
): Router => {
  const router = Router();
  const logger: Logger = options.logger || console;

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

      const verdict = await policyEngine.evaluate(content, { policy: policy as Policy });

      res.json(verdict);

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
   * Update policy configuration
   */
  router.post('/config', (req: Request<object, unknown, ConfigUpdateRequest>, res: Response): void => {
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

      const updatedConfig = policyEngine.updateConfig(newConfig as Parameters<typeof policyEngine.updateConfig>[0]);

      res.json({
        success: true,
        message: 'Configuration updated',
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
   * Reload configuration from file
   */
  router.post('/config/reload', (_req: Request, res: Response): void => {
    try {
      logger.info('[PolicyRoutes] Config reload request');

      const config = policyEngine.reloadConfig();

      res.json({
        success: true,
        message: 'Configuration reloaded from file',
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
   * GET /api/policy/health
   * Health check endpoint
   */
  router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    try {
      const health = await policyEngine.healthCheck();

      const statusCode = health.healthy ? 200 : 503;
      res.status(statusCode).json(health);

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
   * Add a new rule to the policy
   */
  router.post('/rules', (req: Request<object, unknown, RuleInput>, res: Response): void => {
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

      const result = policyEngine.addRule(rule);

      if (!result.success) {
        res.status(400).json({
          error: 'Bad Request',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule added successfully',
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
   * Update an existing rule
   */
  router.put('/rules/:ruleId', (req: Request<{ ruleId: string }, unknown, Partial<RuleInput>>, res: Response): void => {
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

      const result = policyEngine.updateRule(ruleId, updates);

      if (!result.success) {
        res.status(404).json({
          error: 'Not Found',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule updated successfully',
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
   * Delete a rule from the policy
   */
  router.delete('/rules/:ruleId', (req: Request<{ ruleId: string }>, res: Response): void => {
    try {
      const { ruleId } = req.params;

      logger.info('[PolicyRoutes] Delete rule request', { ruleId });

      const result = policyEngine.deleteRule(ruleId);

      if (!result.success) {
        res.status(404).json({
          error: 'Not Found',
          message: result.message
        });
        return;
      }

      res.json({
        success: true,
        message: 'Rule deleted successfully',
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
