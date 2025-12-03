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

const express = require('express');

/**
 * Create policy routes
 * @param {Object} policyEngine - PolicyEngine instance
 * @param {Object} options - Route options
 * @returns {express.Router} Express router
 */
const createPolicyRoutes = (policyEngine, options = {}) => {
  const router = express.Router();
  const logger = options.logger || console;

  /**
   * POST /api/policy/evaluate
   * Evaluate content against the configured policy
   */
  router.post('/evaluate', async (req, res) => {
    try {
      const { content, policy } = req.body;

      if (!content || typeof content !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'content is required and must be a string'
        });
      }

      // Validate policy if provided
      if (policy) {
        const validation = policyEngine.validatePolicy(policy);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid Policy',
            message: 'Provided policy configuration is invalid',
            errors: validation.errors,
            warnings: validation.warnings
          });
        }
      }

      logger.info('[PolicyRoutes] Evaluate request received', {
        contentLength: content.length,
        hasCustomPolicy: !!policy
      });

      const verdict = await policyEngine.evaluate(content, { policy });

      res.json(verdict);

    } catch (error) {
      logger.error('[PolicyRoutes] Evaluation error', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/policy/config
   * Get current policy configuration
   */
  router.get('/config', (req, res) => {
    try {
      const config = policyEngine.getConfig();
      res.json(config);
    } catch (error) {
      logger.error('[PolicyRoutes] Get config error', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * POST /api/policy/config
   * Update policy configuration
   */
  router.post('/config', (req, res) => {
    try {
      const newConfig = req.body;

      if (!newConfig || Object.keys(newConfig).length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Configuration object is required'
        });
      }

      // Validate policy section if provided
      if (newConfig.policy) {
        const mergedPolicy = {
          ...policyEngine.getConfig().policy,
          ...newConfig.policy
        };
        const validation = policyEngine.validatePolicy(mergedPolicy);
        if (!validation.valid) {
          return res.status(400).json({
            error: 'Invalid Configuration',
            message: 'Policy configuration is invalid',
            errors: validation.errors,
            warnings: validation.warnings
          });
        }
      }

      logger.info('[PolicyRoutes] Config update request', {
        sections: Object.keys(newConfig)
      });

      const updatedConfig = policyEngine.updateConfig(newConfig);

      res.json({
        success: true,
        message: 'Configuration updated',
        config: updatedConfig
      });

    } catch (error) {
      logger.error('[PolicyRoutes] Update config error', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * POST /api/policy/config/reload
   * Reload configuration from file
   */
  router.post('/config/reload', (req, res) => {
    try {
      logger.info('[PolicyRoutes] Config reload request');

      const config = policyEngine.reloadConfig();

      res.json({
        success: true,
        message: 'Configuration reloaded from file',
        config
      });

    } catch (error) {
      logger.error('[PolicyRoutes] Reload config error', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  /**
   * GET /api/policy/health
   * Health check endpoint
   */
  router.get('/health', async (req, res) => {
    try {
      const health = await policyEngine.healthCheck();

      const statusCode = health.healthy ? 200 : 503;
      res.status(statusCode).json(health);

    } catch (error) {
      logger.error('[PolicyRoutes] Health check error', {
        error: error.message
      });

      res.status(503).json({
        healthy: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/policy/validate
   * Validate a policy configuration without applying it
   */
  router.post('/validate', (req, res) => {
    try {
      const { policy } = req.body;

      if (!policy) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'policy object is required'
        });
      }

      const validation = policyEngine.validatePolicy(policy);

      res.json({
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings
      });

    } catch (error) {
      logger.error('[PolicyRoutes] Validation error', {
        error: error.message
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: error.message
      });
    }
  });

  return router;
};

module.exports = {
  createPolicyRoutes
};


