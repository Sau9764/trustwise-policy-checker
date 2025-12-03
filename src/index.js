/**
 * Trustwise - Policy Engine Module Entry Point
 * 
 * A configurable Policy Engine that evaluates content against rules using LLM Judges.
 * Supports multiple evaluation strategies: all, any, weighted_threshold
 */

const PolicyEngine = require('./server/PolicyEngine');
const JudgeService = require('./server/JudgeService');
const { 
  createStrategy, 
  getAvailableStrategies,
  AllStrategy,
  AnyStrategy,
  WeightedThresholdStrategy 
} = require('./server/AggregationStrategy');
const { createPolicyRoutes } = require('./routes/PolicyRoutes');
const { config, loadConfig, saveConfig } = require('./policy-config');

/**
 * Initialize the Policy Engine module
 * @param {Object} options - Initialization options
 * @param {Object} options.logger - Logger instance
 * @param {boolean} options.mockMode - Enable mock mode for testing
 * @param {Object} options.mockResponses - Mock responses for testing
 * @returns {Object} Initialized module components
 */
const initialize = (options = {}) => {
  const logger = options.logger || console;
  
  logger.info('[Trustwise] Initializing Policy Engine...');
  
  // Create PolicyEngine instance
  const policyEngine = new PolicyEngine({
    logger,
    mockMode: options.mockMode || false,
    mockResponses: options.mockResponses || {}
  });
  
  // Create routes
  const routes = createPolicyRoutes(policyEngine, { logger });
  
  logger.info('[Trustwise] Policy Engine initialized successfully', {
    policyName: config.policy.name,
    rulesCount: config.policy.rules.length,
    strategy: config.policy.evaluation_strategy
  });
  
  return {
    policyEngine,
    routes
  };
};

// Export module components
module.exports = {
  // Main entry point
  initialize,
  
  // Core classes
  PolicyEngine,
  JudgeService,
  
  // Strategies
  createStrategy,
  getAvailableStrategies,
  AllStrategy,
  AnyStrategy,
  WeightedThresholdStrategy,
  
  // Routes
  createPolicyRoutes,
  
  // Configuration
  config,
  loadConfig,
  saveConfig
};

