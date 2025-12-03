/**
 * ConfigService - MongoDB-based Policy Configuration Management
 * 
 * Handles all CRUD operations for policy configuration stored in MongoDB.
 * Replaces file-based configuration with database storage.
 */

import { PolicyConfig, IPolicyConfig, DEFAULT_CONFIG } from '../models/PolicyConfig';
import { isDatabaseConnected } from '../config/database';
import type { 
  Logger, 
  Policy, 
  JudgeConfig, 
  EngineSettings,
  Config,
  Rule,
  RuleInput
} from '../types';

// ============================================
// Types
// ============================================

export interface ConfigServiceOptions {
  logger?: Logger;
  configId?: string;
}

export interface ConfigUpdateInput {
  policy?: Partial<Policy>;
  judge?: Partial<JudgeConfig>;
  settings?: Partial<EngineSettings>;
}

// ============================================
// Service Class
// ============================================

export class ConfigService {
  private logger: Logger;
  private configId: string;
  private cachedConfig: IPolicyConfig | null = null;

  constructor(options: ConfigServiceOptions = {}) {
    this.logger = options.logger || console;
    this.configId = options.configId || 'default';
  }

  /**
   * Initialize configuration - loads from DB or seeds default
   */
  async initialize(): Promise<Config> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[ConfigService] Initializing configuration', { configId: this.configId });

    // Try to load existing config
    const existingConfig = await PolicyConfig.findOne({ configId: this.configId });

    // If no config exists, seed the default
    const configDoc: IPolicyConfig = existingConfig 
      ? existingConfig 
      : await this.seedDefaultConfig();

    this.cachedConfig = configDoc;

    this.logger.info('[ConfigService] Configuration loaded', {
      configId: configDoc.configId,
      policyName: configDoc.policy.name,
      rulesCount: configDoc.policy.rules.length
    });

    return this.toConfig(configDoc);
  }

  /**
   * Seed the default configuration to MongoDB
   */
  async seedDefaultConfig(): Promise<IPolicyConfig> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[ConfigService] Seeding default configuration');

    // Delete any existing default config
    const deleteResult = await PolicyConfig.deleteOne({ configId: 'default' });
    this.logger.info('[ConfigService] Delete result', { deletedCount: deleteResult.deletedCount });

    // Create new default config
    const config = new PolicyConfig({
      ...DEFAULT_CONFIG,
      configId: this.configId
    });

    this.logger.info('[ConfigService] About to save config', { 
      configId: config.configId,
      isNew: config.isNew 
    });

    const savedConfig = await config.save();

    this.logger.info('[ConfigService] Default configuration seeded', {
      policyName: savedConfig.policy.name,
      rulesCount: savedConfig.policy.rules.length,
      _id: savedConfig._id?.toString()
    });

    return savedConfig as IPolicyConfig;
  }

  /**
   * Get the current configuration
   */
  async getConfig(): Promise<Config> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    // Return cached if available
    if (this.cachedConfig) {
      return this.toConfig(this.cachedConfig);
    }

    const config = await PolicyConfig.findOne({ configId: this.configId });
    
    if (!config) {
      throw new Error(`Configuration '${this.configId}' not found`);
    }

    this.cachedConfig = config as IPolicyConfig;
    return this.toConfig(config as IPolicyConfig);
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: ConfigUpdateInput): Promise<Config> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[ConfigService] Updating configuration', {
      configId: this.configId,
      sections: Object.keys(updates)
    });

    const config = await PolicyConfig.findOne({ configId: this.configId });
    
    if (!config) {
      throw new Error(`Configuration '${this.configId}' not found`);
    }

    // Apply updates
    if (updates.policy) {
      Object.assign(config.policy, updates.policy);
    }
    if (updates.judge) {
      Object.assign(config.judge, updates.judge);
    }
    if (updates.settings) {
      Object.assign(config.settings, updates.settings);
    }

    await config.save();
    this.cachedConfig = config as IPolicyConfig;

    this.logger.info('[ConfigService] Configuration updated', {
      policyName: config.policy.name
    });

    return this.toConfig(config as IPolicyConfig);
  }

  /**
   * Get the policy
   */
  async getPolicy(): Promise<Policy> {
    const config = await this.getConfig();
    return config.policy;
  }

  /**
   * Update the policy
   */
  async updatePolicy(policy: Partial<Policy>): Promise<Policy> {
    const config = await this.updateConfig({ policy });
    return config.policy;
  }

  /**
   * Add a new rule to the policy
   */
  async addRule(rule: RuleInput): Promise<{ success: boolean; rule?: Rule; message?: string }> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const config = await PolicyConfig.findOne({ configId: this.configId });
    
    if (!config) {
      throw new Error(`Configuration '${this.configId}' not found`);
    }

    // Check if rule with same ID already exists
    const existingRule = config.policy.rules.find(r => r.id === rule.id);
    if (existingRule) {
      return {
        success: false,
        message: `Rule with id '${rule.id}' already exists`
      };
    }

    // Create new rule with defaults
    const newRule: Rule = {
      id: rule.id,
      description: rule.description || '',
      judge_prompt: rule.judge_prompt,
      on_fail: rule.on_fail || 'warn',
      weight: rule.weight !== undefined ? rule.weight : 1.0
    };

    // Add to rules array
    config.policy.rules.push(newRule);
    await config.save();
    this.cachedConfig = config as IPolicyConfig;

    this.logger.info('[ConfigService] Rule added', {
      ruleId: newRule.id,
      totalRules: config.policy.rules.length
    });

    return { success: true, rule: newRule };
  }

  /**
   * Update an existing rule
   */
  async updateRule(ruleId: string, updates: Partial<RuleInput>): Promise<{ success: boolean; rule?: Rule; message?: string }> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const config = await PolicyConfig.findOne({ configId: this.configId });
    
    if (!config) {
      throw new Error(`Configuration '${this.configId}' not found`);
    }

    const ruleIndex = config.policy.rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return {
        success: false,
        message: `Rule with id '${ruleId}' not found`
      };
    }

    // If updating the ID, check for conflicts
    if (updates.id && updates.id !== ruleId) {
      const conflictRule = config.policy.rules.find(r => r.id === updates.id);
      if (conflictRule) {
        return {
          success: false,
          message: `Rule with id '${updates.id}' already exists`
        };
      }
    }

    // Update the rule
    const existingRule = config.policy.rules[ruleIndex];
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

    config.policy.rules[ruleIndex] = updatedRule;
    await config.save();
    this.cachedConfig = config as IPolicyConfig;

    this.logger.info('[ConfigService] Rule updated', {
      ruleId: updatedRule.id
    });

    return { success: true, rule: updatedRule };
  }

  /**
   * Delete a rule from the policy
   */
  async deleteRule(ruleId: string): Promise<{ success: boolean; deletedRule?: Rule; message?: string }> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const config = await PolicyConfig.findOne({ configId: this.configId });
    
    if (!config) {
      throw new Error(`Configuration '${this.configId}' not found`);
    }

    const ruleIndex = config.policy.rules.findIndex(r => r.id === ruleId);
    
    if (ruleIndex === -1) {
      return {
        success: false,
        message: `Rule with id '${ruleId}' not found`
      };
    }

    // Remove the rule
    const deletedRule = config.policy.rules.splice(ruleIndex, 1)[0];
    await config.save();
    this.cachedConfig = config as IPolicyConfig;

    this.logger.info('[ConfigService] Rule deleted', {
      ruleId: deletedRule?.id,
      remainingRules: config.policy.rules.length
    });

    return { success: true, deletedRule };
  }

  /**
   * Reset configuration to default
   */
  async resetToDefault(): Promise<Config> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[ConfigService] Resetting configuration to default');

    const config = await this.seedDefaultConfig();
    this.cachedConfig = config;

    return this.toConfig(config);
  }

  /**
   * Get all available configurations
   */
  async listConfigs(): Promise<Array<{ configId: string; policyName: string; isActive: boolean; updatedAt: Date }>> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const configs = await PolicyConfig.find({}, {
      configId: 1,
      'policy.name': 1,
      isActive: 1,
      updatedAt: 1
    }).lean();

    return configs.map(c => ({
      configId: c.configId,
      policyName: c.policy.name,
      isActive: c.isActive,
      updatedAt: c.updatedAt
    }));
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cachedConfig = null;
    this.logger.info('[ConfigService] Cache cleared');
  }

  /**
   * Convert IPolicyConfig to Config type
   */
  private toConfig(doc: IPolicyConfig): Config {
    return {
      policy: {
        name: doc.policy.name,
        version: doc.policy.version,
        default_action: doc.policy.default_action,
        rules: doc.policy.rules.map(r => ({
          id: r.id,
          description: r.description,
          judge_prompt: r.judge_prompt,
          on_fail: r.on_fail,
          weight: r.weight
        })),
        evaluation_strategy: doc.policy.evaluation_strategy,
        threshold: doc.policy.threshold
      },
      judge: {
        model: doc.judge.model,
        temperature: doc.judge.temperature,
        maxTokens: doc.judge.maxTokens,
        timeout: doc.judge.timeout,
        maxRetries: doc.judge.maxRetries,
        retryDelay: doc.judge.retryDelay,
        maxRetryDelay: doc.judge.maxRetryDelay,
        backoffMultiplier: doc.judge.backoffMultiplier,
        circuitBreakerThreshold: doc.judge.circuitBreakerThreshold,
        circuitBreakerResetMs: doc.judge.circuitBreakerResetMs
      },
      settings: {
        parallelEvaluation: doc.settings.parallelEvaluation,
        debugLog: doc.settings.debugLog,
        cacheResults: doc.settings.cacheResults
      }
    };
  }
}

export default ConfigService;
