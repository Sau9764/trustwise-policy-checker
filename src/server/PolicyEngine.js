/**
 * PolicyEngine - Main orchestrator for policy evaluation
 * 
 * Design Principles:
 * - Accepts policy configuration and content to evaluate
 * - Dispatches each rule to JudgeService (parallel or sequential)
 * - Aggregates judgments using configured strategy
 * - Returns structured verdict with latency metrics
 * - Event-driven for extensibility
 */

const EventEmitter = require('events');
const JudgeService = require('./JudgeService');
const { createStrategy, getAvailableStrategies } = require('./AggregationStrategy');
const { loadConfig, saveConfig } = require('../policy-config');

class PolicyEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    
    // Load configuration
    this.config = options.config || loadConfig();
    
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
    
    this.logger.info('[PolicyEngine] Initialized', {
      policyName: this.config.policy.name,
      rulesCount: this.config.policy.rules.length,
      strategy: this.config.policy.evaluation_strategy,
      parallelEvaluation: this.config.settings.parallelEvaluation
    });
  }

  /**
   * Get current active policy (runtime override or config)
   * @returns {Object} Active policy configuration
   */
  getActivePolicy() {
    return this.runtimePolicy || this.config.policy;
  }

  /**
   * Set runtime policy override
   * @param {Object} policy - Policy configuration to use
   */
  setRuntimePolicy(policy) {
    this.runtimePolicy = policy;
    this.logger.info('[PolicyEngine] Runtime policy set', {
      name: policy.name,
      rulesCount: policy.rules.length
    });
  }

  /**
   * Clear runtime policy override (revert to config)
   */
  clearRuntimePolicy() {
    this.runtimePolicy = null;
    this.logger.info('[PolicyEngine] Runtime policy cleared, using config policy');
  }

  /**
   * Evaluate content against the active policy
   * 
   * @param {string} content - Content to evaluate
   * @param {Object} options - Evaluation options
   * @param {Object} options.policy - Optional policy override for this evaluation
   * @returns {Promise<Object>} Structured verdict object
   */
  async evaluate(content, options = {}) {
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
      const verdict = {
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
      
      this.logger.error('[PolicyEngine] Evaluation failed', {
        policyName: policy.name,
        error: error.message,
        totalLatency
      });

      // Emit evaluation error event
      this.emit('policy:evaluation-error', {
        policyName: policy.name,
        error: error.message,
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
        error: error.message,
        total_latency_ms: totalLatency
      };
    }
  }

  /**
   * Evaluate all rules against content
   * @private
   */
  async evaluateRules(rules, content) {
    if (this.config.settings.parallelEvaluation) {
      return this.evaluateRulesParallel(rules, content);
    }
    return this.evaluateRulesSequential(rules, content);
  }

  /**
   * Evaluate rules in parallel
   * @private
   */
  async evaluateRulesParallel(rules, content) {
    this.logger.info('[PolicyEngine] Evaluating rules in parallel', {
      rulesCount: rules.length
    });

    const promises = rules.map(async (rule) => {
      const result = await this.judgeService.evaluate(rule, content);
      return {
        rule_id: rule.id,
        action: rule.on_fail,
        weight: rule.weight || 1.0,
        ...result
      };
    });

    return Promise.all(promises);
  }

  /**
   * Evaluate rules sequentially
   * @private
   */
  async evaluateRulesSequential(rules, content) {
    this.logger.info('[PolicyEngine] Evaluating rules sequentially', {
      rulesCount: rules.length
    });

    const results = [];
    
    for (const rule of rules) {
      const result = await this.judgeService.evaluate(rule, content);
      results.push({
        rule_id: rule.id,
        action: rule.on_fail,
        weight: rule.weight || 1.0,
        ...result
      });
    }

    return results;
  }

  /**
   * Reload configuration from file
   */
  reloadConfig() {
    this.config = loadConfig();
    
    // Update JudgeService config
    this.judgeService.updateConfig(this.config.judge);
    
    this.logger.info('[PolicyEngine] Configuration reloaded', {
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
   * Update and save configuration
   * @param {Object} newConfig - New configuration to merge
   */
  updateConfig(newConfig) {
    // Merge with existing config
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

    // Save to file
    saveConfig(this.config);

    this.logger.info('[PolicyEngine] Configuration updated and saved', {
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
   * @returns {Object} Current configuration
   */
  getConfig() {
    return {
      policy: this.config.policy,
      judge: this.config.judge,
      settings: this.config.settings
    };
  }

  /**
   * Get available evaluation strategies
   * @returns {Array<string>} Available strategy names
   */
  getAvailableStrategies() {
    return getAvailableStrategies();
  }

  /**
   * Set mock mode for testing
   * @param {boolean} enabled - Enable/disable mock mode
   * @param {Object} responses - Mock responses keyed by rule ID
   */
  setMockMode(enabled, responses = {}) {
    this.judgeService.setMockMode(enabled, responses);
  }

  /**
   * Health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
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
   * @param {Object} policy - Policy to validate
   * @returns {Object} Validation result
   */
  validatePolicy(policy) {
    const errors = [];
    const warnings = [];

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
}

module.exports = PolicyEngine;

