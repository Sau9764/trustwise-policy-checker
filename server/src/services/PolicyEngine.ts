/**
 * PolicyEngine - Main orchestrator for policy evaluation
 * 
 * Design Principles:
 * - Accepts policy configuration and content to evaluate
 * - Dispatches each rule to JudgeService (parallel or sequential)
 * - Aggregates judgments using configured strategy
 * - Returns structured verdict with latency metrics
 * - Event-driven for extensibility
 * - Uses MongoDB for configuration storage via ConfigService
 */

import { EventEmitter } from 'events';
import { JudgeService } from './JudgeService';
import { ConfigService } from './ConfigService';
import { createStrategy, getAvailableStrategies } from './AggregationStrategy';
import type {
  Logger,
  Config,
  Policy,
  PolicyInput,
  Rule,
  RuleInput,
  RuleResult,
  PolicyVerdict,
  PolicyEngineOptions,
  EvaluateOptions,
  MockResponses,
  ValidationResult,
  RuleOperationResult,
  PolicyEngineHealthCheck,
  EvaluationStrategy,
  JudgeServiceInterface,
  PolicyEngineInterface,
  JudgeEvaluationResult
} from '../types';

export interface PolicyEngineExtendedOptions extends PolicyEngineOptions {
  configService?: ConfigService;
}

export class PolicyEngine extends EventEmitter implements PolicyEngineInterface {
  private logger: Logger;
  private config: Config;
  private configService: ConfigService | null;
  private judgeService: JudgeServiceInterface;
  private runtimePolicy: Policy | null;
  private initialized: boolean = false;

  constructor(options: PolicyEngineExtendedOptions = {}) {
    super();
    this.logger = options.logger || console;
    this.configService = options.configService || null;
    
    // Initialize with provided config or empty config (will be loaded later)
    this.config = options.config || {
      policy: {
        name: 'uninitialized',
        version: '0.0.0',
        default_action: 'warn',
        rules: [],
        evaluation_strategy: 'all'
      },
      judge: {
        model: 'gpt-4o-mini',
        temperature: 0.1,
        maxTokens: 500,
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000
      },
      settings: {
        parallelEvaluation: true,
        debugLog: false,
        cacheResults: false
      }
    };
    
    // Initialize JudgeService
    this.judgeService = options.judgeService || new JudgeService({
      logger: this.logger,
      config: this.config.judge,
      apiKey: this.config.apiKey,
      mockMode: options.mockMode || false,
      mockResponses: options.mockResponses || {}
    });
    
    // Runtime policy override (for API-provided policies)
    this.runtimePolicy = null;
  }

  /**
   * Initialize the PolicyEngine with configuration from MongoDB
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.configService) {
      this.logger.info('[PolicyEngine] Loading configuration from MongoDB...');
      this.config = await this.configService.initialize();
      
      // Update JudgeService with loaded config
      this.judgeService.updateConfig(this.config.judge);
    }

    this.initialized = true;
    
    this.logger.info('[PolicyEngine] Initialized', {
      policyName: this.config.policy.name,
      rulesCount: this.config.policy.rules.length,
      strategy: this.config.policy.evaluation_strategy,
      parallelEvaluation: this.config.settings.parallelEvaluation
    });
  }

  /**
   * Get current active policy (runtime override or config)
   */
  getActivePolicy(): Policy {
    return this.runtimePolicy || this.config.policy;
  }

  /**
   * Set runtime policy override
   */
  setRuntimePolicy(policy: Policy): void {
    this.runtimePolicy = policy;
    this.logger.info('[PolicyEngine] Runtime policy set', {
      name: policy.name,
      rulesCount: policy.rules.length
    });
  }

  /**
   * Clear runtime policy override (revert to config)
   */
  clearRuntimePolicy(): void {
    this.runtimePolicy = null;
    this.logger.info('[PolicyEngine] Runtime policy cleared, using config policy');
  }

  /**
   * Evaluate content against the active policy
   */
  async evaluate(content: string, options: EvaluateOptions = {}): Promise<PolicyVerdict> {
    const startTime = Date.now();
    
    // Use provided policy, runtime policy, or config policy
    const policy = options.policy || this.getActivePolicy();
    
    this.logger.info('[PolicyEngine] Starting evaluation', {
      policyName: policy.name,
      contentLength: content.length,
      rulesCount: policy.rules.length,
      strategy: policy.evaluation_strategy
    });

    // Emit evaluation start event
    this.emit('policy:evaluation-start', {
      policyName: policy.name,
      contentLength: content.length,
      timestamp: startTime
    });

    try {
      // Evaluate all rules
      const ruleResults = await this.evaluateRules(policy.rules, content);
      
      // Aggregate results using the configured strategy
      const strategy = createStrategy(policy.evaluation_strategy, this.logger);
      const aggregation = strategy.aggregate(ruleResults, policy);
      
      const totalLatency = Date.now() - startTime;
      
      // Build verdict object
      const verdict: PolicyVerdict = {
        policy_name: policy.name,
        policy_version: policy.version,
        final_verdict: aggregation.final_verdict,
        passed: aggregation.passed,
        evaluated_at: new Date().toISOString(),
        rule_results: ruleResults.map(result => ({
          rule_id: result.rule_id,
          verdict: result.verdict,
          confidence: result.confidence,
          reasoning: result.reasoning,
          action: result.action,
          weight: result.weight,
          latency_ms: result.latency_ms
        })),
        summary: aggregation.summary,
        total_latency_ms: totalLatency
      };

      this.logger.info('[PolicyEngine] Evaluation complete', {
        policyName: policy.name,
        finalVerdict: verdict.final_verdict,
        passed: verdict.passed,
        totalLatency
      });

      // Emit evaluation complete event
      this.emit('policy:evaluation-complete', {
        policyName: policy.name,
        finalVerdict: verdict.final_verdict,
        passed: verdict.passed,
        totalLatency
      });

      return verdict;

    } catch (error) {
      const totalLatency = Date.now() - startTime;
      const err = error as Error;
      
      this.logger.error('[PolicyEngine] Evaluation failed', {
        policyName: policy.name,
        error: err.message,
        totalLatency
      });

      // Emit evaluation error event
      this.emit('policy:evaluation-error', {
        policyName: policy.name,
        error: err.message,
        totalLatency
      });

      // Return error verdict
      return {
        policy_name: policy.name,
        policy_version: policy.version,
        final_verdict: 'ERROR',
        passed: false,
        evaluated_at: new Date().toISOString(),
        rule_results: [],
        error: err.message,
        total_latency_ms: totalLatency
      };
    }
  }

  /**
   * Evaluate all rules against content
   */
  private async evaluateRules(rules: Rule[], content: string): Promise<RuleResult[]> {
    if (this.config.settings.parallelEvaluation) {
      return this.evaluateRulesParallel(rules, content);
    }
    return this.evaluateRulesSequential(rules, content);
  }

  /**
   * Evaluate rules in parallel
   */
  private async evaluateRulesParallel(rules: Rule[], content: string): Promise<RuleResult[]> {
    this.logger.info('[PolicyEngine] Evaluating rules in parallel', {
      rulesCount: rules.length
    });

    const promises = rules.map(async (rule): Promise<RuleResult> => {
      const result: JudgeEvaluationResult = await this.judgeService.evaluate(rule, content);
      return {
        rule_id: rule.id,
        action: rule.on_fail,
        weight: rule.weight || 1.0,
        verdict: result.verdict,
        confidence: result.confidence,
        reasoning: result.reasoning,
        latency_ms: result.latency_ms || 0
      };
    });

    return Promise.all(promises);
  }

  /**
   * Evaluate rules sequentially
   */
  private async evaluateRulesSequential(rules: Rule[], content: string): Promise<RuleResult[]> {
    this.logger.info('[PolicyEngine] Evaluating rules sequentially', {
      rulesCount: rules.length
    });

    const results: RuleResult[] = [];
    
    for (const rule of rules) {
      const result: JudgeEvaluationResult = await this.judgeService.evaluate(rule, content);
      results.push({
        rule_id: rule.id,
        action: rule.on_fail,
        weight: rule.weight || 1.0,
        verdict: result.verdict,
        confidence: result.confidence,
        reasoning: result.reasoning,
        latency_ms: result.latency_ms || 0
      });
    }

    return results;
  }

  /**
   * Reload configuration from MongoDB
   */
  reloadConfig(): Config {
    // This is now sync but we'll update config from cache
    if (this.configService) {
      this.configService.clearCache();
    }
    
    this.logger.info('[PolicyEngine] Configuration cache cleared, will reload on next access');

    // Emit config reload event
    this.emit('policy:config-reloaded', {
      policyName: this.config.policy.name
    });

    return this.config;
  }

  /**
   * Reload configuration from MongoDB (async version)
   */
  async reloadConfigAsync(): Promise<Config> {
    if (this.configService) {
      this.configService.clearCache();
      this.config = await this.configService.getConfig();
      this.judgeService.updateConfig(this.config.judge);
    }
    
    this.logger.info('[PolicyEngine] Configuration reloaded from MongoDB', {
      policyName: this.config.policy.name,
      rulesCount: this.config.policy.rules.length
    });

    // Emit config reload event
    this.emit('policy:config-reloaded', {
      policyName: this.config.policy.name
    });

    return this.config;
  }

  /**
   * Update and save configuration to MongoDB
   */
  updateConfig(newConfig: Partial<Config>): Config {
    // Merge with existing config in memory
    if (newConfig.policy) {
      this.config.policy = { ...this.config.policy, ...newConfig.policy };
    }
    if (newConfig.judge) {
      this.config.judge = { ...this.config.judge, ...newConfig.judge };
      this.judgeService.updateConfig(this.config.judge);
    }
    if (newConfig.settings) {
      this.config.settings = { ...this.config.settings, ...newConfig.settings };
    }

    // Save to MongoDB asynchronously
    if (this.configService) {
      this.configService.updateConfig(newConfig).catch(err => {
        this.logger.error('[PolicyEngine] Failed to save config to MongoDB', {
          error: (err as Error).message
        });
      });
    }

    this.logger.info('[PolicyEngine] Configuration updated', {
      policyName: this.config.policy.name
    });

    // Emit config update event
    this.emit('policy:config-updated', {
      policyName: this.config.policy.name
    });

    return this.config;
  }

  /**
   * Update and save configuration to MongoDB (async version)
   */
  async updateConfigAsync(newConfig: Partial<Config>): Promise<Config> {
    if (this.configService) {
      this.config = await this.configService.updateConfig(newConfig);
      if (newConfig.judge) {
        this.judgeService.updateConfig(this.config.judge);
      }
    } else {
      // Fallback to in-memory update
      if (newConfig.policy) {
        this.config.policy = { ...this.config.policy, ...newConfig.policy };
      }
      if (newConfig.judge) {
        this.config.judge = { ...this.config.judge, ...newConfig.judge };
        this.judgeService.updateConfig(this.config.judge);
      }
      if (newConfig.settings) {
        this.config.settings = { ...this.config.settings, ...newConfig.settings };
      }
    }

    this.logger.info('[PolicyEngine] Configuration updated and saved to MongoDB', {
      policyName: this.config.policy.name
    });

    // Emit config update event
    this.emit('policy:config-updated', {
      policyName: this.config.policy.name
    });

    return this.config;
  }

  /**
   * Get current configuration
   */
  getConfig(): Omit<Config, 'apiKey'> {
    return {
      policy: this.config.policy,
      judge: this.config.judge,
      settings: this.config.settings
    };
  }

  /**
   * Get available evaluation strategies
   */
  getAvailableStrategies(): EvaluationStrategy[] {
    return getAvailableStrategies();
  }

  /**
   * Set mock mode for testing
   */
  setMockMode(enabled: boolean, responses: MockResponses = {}): void {
    this.judgeService.setMockMode(enabled, responses);
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<PolicyEngineHealthCheck> {
    const judgeHealth = await this.judgeService.healthCheck();
    
    return {
      healthy: judgeHealth.healthy,
      engine: {
        policyName: this.config.policy.name,
        rulesCount: this.config.policy.rules.length,
        strategy: this.config.policy.evaluation_strategy,
        parallelEvaluation: this.config.settings.parallelEvaluation
      },
      judge: judgeHealth,
      availableStrategies: getAvailableStrategies()
    };
  }

  /**
   * Validate a policy configuration
   */
  validatePolicy(policy: PolicyInput): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!policy.name) {
      errors.push('Policy name is required');
    }
    if (!policy.rules || !Array.isArray(policy.rules)) {
      errors.push('Policy rules must be an array');
    } else {
      // Validate each rule
      policy.rules.forEach((rule, index) => {
        if (!rule.id) {
          errors.push(`Rule ${index + 1}: id is required`);
        }
        if (!rule.judge_prompt) {
          errors.push(`Rule ${index + 1}: judge_prompt is required`);
        }
        if (rule.weight !== undefined && (rule.weight < 0 || rule.weight > 1)) {
          warnings.push(`Rule ${index + 1}: weight should be between 0 and 1`);
        }
      });
    }

    // Validate strategy
    if (policy.evaluation_strategy && !getAvailableStrategies().includes(policy.evaluation_strategy)) {
      errors.push(`Invalid evaluation_strategy: ${policy.evaluation_strategy}. Valid: ${getAvailableStrategies().join(', ')}`);
    }

    // Validate threshold for weighted strategy
    if (policy.evaluation_strategy === 'weighted_threshold') {
      if (policy.threshold === undefined) {
        warnings.push('weighted_threshold strategy should have a threshold defined');
      } else if (policy.threshold < 0 || policy.threshold > 1) {
        errors.push('threshold must be between 0 and 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Add a new rule to the policy
   */
  addRule(rule: RuleInput): RuleOperationResult {
    // Check if rule with same ID already exists
    const existingRule = this.config.policy.rules.find(r => r.id === rule.id);
    if (existingRule) {
      return {
        success: false,
        message: `Rule with id '${rule.id}' already exists`
      };
    }

    // Set default values
    const newRule: Rule = {
      id: rule.id,
      description: rule.description || '',
      judge_prompt: rule.judge_prompt,
      on_fail: rule.on_fail || 'warn',
      weight: rule.weight !== undefined ? rule.weight : 1.0
    };

    // Add to rules array
    this.config.policy.rules.push(newRule);

    // Save to MongoDB asynchronously
    if (this.configService) {
      this.configService.addRule(rule).catch(err => {
        this.logger.error('[PolicyEngine] Failed to save rule to MongoDB', {
          error: (err as Error).message
        });
      });
    }

    this.logger.info('[PolicyEngine] Rule added', {
      ruleId: newRule.id,
      totalRules: this.config.policy.rules.length
    });

    // Emit rule added event
    this.emit('policy:rule-added', { rule: newRule });

    return {
      success: true,
      rule: newRule
    };
  }

  /**
   * Add a new rule to the policy (async version)
   */
  async addRuleAsync(rule: RuleInput): Promise<RuleOperationResult> {
    if (this.configService) {
      const result = await this.configService.addRule(rule);
      if (result.success && result.rule) {
        this.config.policy.rules.push(result.rule);
        this.emit('policy:rule-added', { rule: result.rule });
      }
      return result;
    }
    return this.addRule(rule);
  }

  /**
   * Update an existing rule
   */
  updateRule(ruleId: string, updates: Partial<RuleInput>): RuleOperationResult {
    const ruleIndex = this.config.policy.rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return {
        success: false,
        message: `Rule with id '${ruleId}' not found`
      };
    }

    // If updating the ID, check for conflicts
    if (updates.id && updates.id !== ruleId) {
      const conflictRule = this.config.policy.rules.find(r => r.id === updates.id);
      if (conflictRule) {
        return {
          success: false,
          message: `Rule with id '${updates.id}' already exists`
        };
      }
    }

    // Update the rule
    const existingRule = this.config.policy.rules[ruleIndex];
    if (!existingRule) {
      return {
        success: false,
        message: `Rule with id '${ruleId}' not found`
      };
    }

    const updatedRule: Rule = {
      ...existingRule,
      ...updates,
      id: updates.id || existingRule.id,
      judge_prompt: updates.judge_prompt || existingRule.judge_prompt,
      on_fail: updates.on_fail || existingRule.on_fail,
      weight: updates.weight !== undefined ? updates.weight : existingRule.weight
    };

    this.config.policy.rules[ruleIndex] = updatedRule;

    // Save to MongoDB asynchronously
    if (this.configService) {
      this.configService.updateRule(ruleId, updates).catch(err => {
        this.logger.error('[PolicyEngine] Failed to update rule in MongoDB', {
          error: (err as Error).message
        });
      });
    }

    this.logger.info('[PolicyEngine] Rule updated', {
      ruleId: updatedRule.id,
      updates: Object.keys(updates)
    });

    // Emit rule updated event
    this.emit('policy:rule-updated', { rule: updatedRule });

    return {
      success: true,
      rule: updatedRule
    };
  }

  /**
   * Update an existing rule (async version)
   */
  async updateRuleAsync(ruleId: string, updates: Partial<RuleInput>): Promise<RuleOperationResult> {
    if (this.configService) {
      const result = await this.configService.updateRule(ruleId, updates);
      if (result.success && result.rule) {
        const ruleIndex = this.config.policy.rules.findIndex(r => r.id === ruleId);
        if (ruleIndex !== -1) {
          this.config.policy.rules[ruleIndex] = result.rule;
        }
        this.emit('policy:rule-updated', { rule: result.rule });
      }
      return result;
    }
    return this.updateRule(ruleId, updates);
  }

  /**
   * Delete a rule from the policy
   */
  deleteRule(ruleId: string): RuleOperationResult {
    const ruleIndex = this.config.policy.rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return {
        success: false,
        message: `Rule with id '${ruleId}' not found`
      };
    }

    // Remove the rule
    const deletedRule = this.config.policy.rules.splice(ruleIndex, 1)[0];

    // Save to MongoDB asynchronously
    if (this.configService) {
      this.configService.deleteRule(ruleId).catch(err => {
        this.logger.error('[PolicyEngine] Failed to delete rule from MongoDB', {
          error: (err as Error).message
        });
      });
    }

    this.logger.info('[PolicyEngine] Rule deleted', {
      ruleId: deletedRule?.id,
      remainingRules: this.config.policy.rules.length
    });

    // Emit rule deleted event
    this.emit('policy:rule-deleted', { ruleId: deletedRule?.id });

    return {
      success: true,
      deletedRule
    };
  }

  /**
   * Delete a rule from the policy (async version)
   */
  async deleteRuleAsync(ruleId: string): Promise<RuleOperationResult> {
    if (this.configService) {
      const result = await this.configService.deleteRule(ruleId);
      if (result.success) {
        const ruleIndex = this.config.policy.rules.findIndex(r => r.id === ruleId);
        if (ruleIndex !== -1) {
          this.config.policy.rules.splice(ruleIndex, 1);
        }
        this.emit('policy:rule-deleted', { ruleId });
      }
      return result;
    }
    return this.deleteRule(ruleId);
  }

  /**
   * Reset configuration to default
   */
  async resetToDefault(): Promise<Config> {
    if (this.configService) {
      this.config = await this.configService.resetToDefault();
      this.judgeService.updateConfig(this.config.judge);
      
      this.logger.info('[PolicyEngine] Configuration reset to default', {
        policyName: this.config.policy.name
      });

      this.emit('policy:config-reset', {
        policyName: this.config.policy.name
      });
    }
    return this.config;
  }
}

export default PolicyEngine;
