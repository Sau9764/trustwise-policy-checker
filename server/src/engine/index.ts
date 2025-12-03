/**
 * Trustwise - Policy Engine Module Entry Point
 * 
 * A configurable Policy Engine that evaluates content against rules using LLM Judges.
 * Supports multiple evaluation strategies: all, any, weighted_threshold
 * Uses MongoDB for configuration and history storage.
 */

import { PolicyEngine } from '../services/PolicyEngine';
import { JudgeService } from '../services/JudgeService';
import { HistoryService } from '../services/HistoryService';
import { ConfigService } from '../services/ConfigService';
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
  configService: ConfigService;
  initializeAsync: () => Promise<void>;
}

/**
 * Initialize the Policy Engine module
 * Returns services and routes, but requires calling initializeAsync() after MongoDB is connected
 */
export const initialize = (options: InitializeOptions = {}): InitializeResultExtended => {
  const logger: Logger = options.logger || console;
  
  logger.info('[Trustwise] Creating Policy Engine services...');
  
  // Create ConfigService for MongoDB-based config management
  const configService = new ConfigService({ logger });

  // Create HistoryService instance
  const historyService = new HistoryService({ logger });
  
  // Create PolicyEngine instance with ConfigService
  const policyEngine: PolicyEngineInterface = new PolicyEngine({
    logger,
    configService,
    mockMode: options.mockMode || false,
    mockResponses: options.mockResponses || {}
  }) as PolicyEngineInterface;
  
  // Create routes with services
  const routes = createPolicyRoutes(policyEngine, { logger, historyService, configService });
  
  // Create history routes
  const historyRoutes = createHistoryRoutes(historyService, policyEngine, { logger });

  /**
   * Async initialization - call this after MongoDB is connected
   */
  const initializeAsync = async (): Promise<void> => {
    logger.info('[Trustwise] Initializing Policy Engine with MongoDB config...');
    
    // Initialize PolicyEngine (loads config from MongoDB)
    await (policyEngine as PolicyEngine).initialize();
    
    const config = policyEngine.getConfig();
    
    logger.info('[Trustwise] Policy Engine initialized successfully', {
      policyName: config.policy.name,
      rulesCount: config.policy.rules.length,
      strategy: config.policy.evaluation_strategy
    });
  };
  
  return {
    policyEngine,
    routes,
    historyService,
    historyRoutes,
    configService,
    initializeAsync
  };
};

// Export module components
export {
  // Core classes
  PolicyEngine,
  JudgeService,
  HistoryService,
  ConfigService,
  
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
  createHistoryRoutes
};

// Re-export types
export * from '../types';
