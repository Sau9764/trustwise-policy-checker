/**
 * Trustwise - Policy Engine Module Entry Point
 * 
 * A configurable Policy Engine that evaluates content against rules using LLM Judges.
 * Supports multiple evaluation strategies: all, any, weighted_threshold
 */

import { PolicyEngine } from '../services/PolicyEngine';
import { JudgeService } from '../services/JudgeService';
import { HistoryService } from '../services/HistoryService';
import { 
  createStrategy, 
  getAvailableStrategies,
  AllStrategy,
  AnyStrategy,
  WeightedThresholdStrategy,
  BaseStrategy,
  ACTION_PRIORITY
} from '../services/AggregationStrategy';
import { createPolicyRoutes } from '../routes/PolicyRoutes';
import { createHistoryRoutes } from '../routes/HistoryRoutes';
import { config, loadConfig, saveConfig, baseConfig } from '../config/policy-config';
import type {
  Logger,
  InitializeOptions,
  InitializeResult,
  PolicyEngineInterface
} from '../types';
import type { Router } from 'express';

export interface InitializeResultExtended extends InitializeResult {
  historyService: HistoryService;
  historyRoutes: Router;
}

/**
 * Initialize the Policy Engine module
 */
export const initialize = (options: InitializeOptions = {}): InitializeResultExtended => {
  const logger: Logger = options.logger || console;
  
  logger.info('[Trustwise] Initializing Policy Engine...');
  
  // Create PolicyEngine instance
  const policyEngine: PolicyEngineInterface = new PolicyEngine({
    logger,
    mockMode: options.mockMode || false,
    mockResponses: options.mockResponses || {}
  });

  // Create HistoryService instance
  const historyService = new HistoryService({ logger });
  
  // Create routes with historyService
  const routes = createPolicyRoutes(policyEngine, { logger, historyService });
  
  // Create history routes
  const historyRoutes = createHistoryRoutes(historyService, policyEngine, { logger });
  
  logger.info('[Trustwise] Policy Engine initialized successfully', {
    policyName: config.policy.name,
    rulesCount: config.policy.rules.length,
    strategy: config.policy.evaluation_strategy
  });
  
  return {
    policyEngine,
    routes,
    historyService,
    historyRoutes
  };
};

// Export module components
export {
  // Core classes
  PolicyEngine,
  JudgeService,
  HistoryService,
  
  // Strategies
  createStrategy,
  getAvailableStrategies,
  BaseStrategy,
  AllStrategy,
  AnyStrategy,
  WeightedThresholdStrategy,
  ACTION_PRIORITY,
  
  // Routes
  createPolicyRoutes,
  createHistoryRoutes,
  
  // Configuration
  config,
  baseConfig,
  loadConfig,
  saveConfig
};

// Re-export types
export * from '../types';

