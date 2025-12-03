/**
 * Policy Engine Configuration
 * SINGLE SOURCE OF TRUTH for all environment variable parsing
 * Loads default configuration from policy-config.json and merges with environment variables
 * Environment variables take precedence over JSON defaults
 */

import fs from 'fs';
import path from 'path';
import type { Config, BaseConfig, Policy, JudgeConfig, EngineSettings } from '../types';

// Load base configuration from JSON file
const configPath = path.join(__dirname, 'policy-config.json');
let baseConfig: BaseConfig;

try {
  baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BaseConfig;
} catch {
  // Fall back to default config if main config doesn't exist
  const defaultConfigPath = path.join(__dirname, 'policy-config.default.json');
  baseConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8')) as BaseConfig;
}

/**
 * Load and merge configuration with environment variable overrides
 * @returns Merged configuration object
 */
const loadConfig = (): Config => {
  // Re-read config file for hot reload support
  let currentConfig: BaseConfig;
  try {
    currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8')) as BaseConfig;
  } catch {
    currentConfig = baseConfig;
  }

  const policy: Policy = {
    name: process.env['POLICY_NAME'] || currentConfig.policy.name,
    version: currentConfig.policy.version,
    default_action: (process.env['POLICY_DEFAULT_ACTION'] as Policy['default_action']) || currentConfig.policy.default_action,
    rules: currentConfig.policy.rules,
    evaluation_strategy: (process.env['POLICY_EVALUATION_STRATEGY'] as Policy['evaluation_strategy']) || currentConfig.policy.evaluation_strategy,
    threshold: process.env['POLICY_THRESHOLD']
      ? parseFloat(process.env['POLICY_THRESHOLD'])
      : currentConfig.policy.threshold
  };

  const judge: JudgeConfig = {
    model: process.env['POLICY_JUDGE_MODEL'] || currentConfig.judge.model,
    temperature: process.env['POLICY_JUDGE_TEMPERATURE']
      ? parseFloat(process.env['POLICY_JUDGE_TEMPERATURE'])
      : currentConfig.judge.temperature,
    maxTokens: process.env['POLICY_JUDGE_MAX_TOKENS']
      ? parseInt(process.env['POLICY_JUDGE_MAX_TOKENS'], 10)
      : currentConfig.judge.maxTokens,
    timeout: process.env['POLICY_JUDGE_TIMEOUT']
      ? parseInt(process.env['POLICY_JUDGE_TIMEOUT'], 10)
      : currentConfig.judge.timeout,
    maxRetries: process.env['POLICY_JUDGE_MAX_RETRIES']
      ? parseInt(process.env['POLICY_JUDGE_MAX_RETRIES'], 10)
      : currentConfig.judge.maxRetries,
    retryDelay: process.env['POLICY_JUDGE_RETRY_DELAY']
      ? parseInt(process.env['POLICY_JUDGE_RETRY_DELAY'], 10)
      : currentConfig.judge.retryDelay
  };

  const settings: EngineSettings = {
    parallelEvaluation: process.env['POLICY_PARALLEL_EVALUATION'] === 'true' ||
      (process.env['POLICY_PARALLEL_EVALUATION'] !== 'false' && currentConfig.settings.parallelEvaluation),
    debugLog: process.env['POLICY_DEBUG_LOG'] === 'true' || currentConfig.settings.debugLog,
    cacheResults: process.env['POLICY_CACHE_RESULTS'] === 'true' || currentConfig.settings.cacheResults
  };

  return {
    policy,
    judge,
    settings,
    apiKey: process.env['OPENAI_API_KEY']
  };
};

/**
 * Save configuration to JSON file (for hot reload)
 * @param newConfig - New configuration to save
 */
const saveConfig = (newConfig: Config): void => {
  const configToSave: BaseConfig = {
    policy: newConfig.policy,
    judge: newConfig.judge,
    settings: newConfig.settings
  };

  fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
};

// Initial config load
const config = loadConfig();

export { config, baseConfig, loadConfig, saveConfig };

