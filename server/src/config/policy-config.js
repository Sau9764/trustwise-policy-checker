/**
 * Policy Engine Configuration
 * SINGLE SOURCE OF TRUTH for all environment variable parsing
 * Loads default configuration from policy-config.json and merges with environment variables
 * Environment variables take precedence over JSON defaults
 */

const fs = require('fs');
const path = require('path');

// Load base configuration from JSON file
const configPath = path.join(__dirname, 'policy-config.json');
let baseConfig;

try {
  baseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (error) {
  // Fall back to default config if main config doesn't exist
  const defaultConfigPath = path.join(__dirname, 'policy-config.default.json');
  baseConfig = JSON.parse(fs.readFileSync(defaultConfigPath, 'utf8'));
}

/**
 * Load and merge configuration with environment variable overrides
 * @returns {Object} Merged configuration object
 */
const loadConfig = () => {
  // Re-read config file for hot reload support
  let currentConfig;
  try {
    currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    currentConfig = baseConfig;
  }

  const policy = {
    name: process.env.POLICY_NAME || currentConfig.policy.name,
    version: currentConfig.policy.version,
    default_action: process.env.POLICY_DEFAULT_ACTION || currentConfig.policy.default_action,
    rules: currentConfig.policy.rules,
    evaluation_strategy: process.env.POLICY_EVALUATION_STRATEGY || currentConfig.policy.evaluation_strategy,
    threshold: process.env.POLICY_THRESHOLD
      ? parseFloat(process.env.POLICY_THRESHOLD)
      : currentConfig.policy.threshold
  };

  const judge = {
    model: process.env.POLICY_JUDGE_MODEL || currentConfig.judge.model,
    temperature: process.env.POLICY_JUDGE_TEMPERATURE
      ? parseFloat(process.env.POLICY_JUDGE_TEMPERATURE)
      : currentConfig.judge.temperature,
    maxTokens: process.env.POLICY_JUDGE_MAX_TOKENS
      ? parseInt(process.env.POLICY_JUDGE_MAX_TOKENS, 10)
      : currentConfig.judge.maxTokens,
    timeout: process.env.POLICY_JUDGE_TIMEOUT
      ? parseInt(process.env.POLICY_JUDGE_TIMEOUT, 10)
      : currentConfig.judge.timeout,
    maxRetries: process.env.POLICY_JUDGE_MAX_RETRIES
      ? parseInt(process.env.POLICY_JUDGE_MAX_RETRIES, 10)
      : currentConfig.judge.maxRetries,
    retryDelay: process.env.POLICY_JUDGE_RETRY_DELAY
      ? parseInt(process.env.POLICY_JUDGE_RETRY_DELAY, 10)
      : currentConfig.judge.retryDelay
  };

  const settings = currentConfig.settings || {};

  return {
    policy,
    judge,
    settings: {
      parallelEvaluation: settings.parallelEvaluation ?? true,
      debugLog: process.env.POLICY_DEBUG_LOG === 'true' || settings.debugLog,
      cacheResults: process.env.POLICY_CACHE_RESULTS === 'true' || settings.cacheResults
    },
    apiKey: process.env.OPENAI_API_KEY
  };
};

/**
 * Save configuration to JSON file (for hot reload)
 * @param {Object} newConfig - New configuration to save
 */
const saveConfig = (newConfig) => {
  const configToSave = {
    policy: newConfig.policy,
    judge: newConfig.judge,
    settings: newConfig.settings
  };

  fs.writeFileSync(configPath, JSON.stringify(configToSave, null, 2), 'utf8');
};

// Initial config load
const config = loadConfig();

module.exports = {
  config,
  baseConfig,
  loadConfig,
  saveConfig
};


