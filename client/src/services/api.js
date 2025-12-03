/**
 * API Service - Handles all communication with the Trustwise backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

/**
 * Generic fetch wrapper with error handling
 */
const apiFetch = async (endpoint, options = {}) => {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = await fetch(url, {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `API Error: ${response.status}`);
  }

  return response.json();
};

/**
 * Fetch current policy configuration
 */
export const fetchConfig = async () => {
  return apiFetch('/api/policy/config');
};

/**
 * Update policy configuration
 */
export const updateConfig = async (config) => {
  return apiFetch('/api/policy/config', {
    method: 'POST',
    body: JSON.stringify(config),
  });
};

/**
 * Reload configuration from file
 */
export const reloadConfig = async () => {
  return apiFetch('/api/policy/config/reload', {
    method: 'POST',
  });
};

/**
 * Evaluate content against policy
 * @param {string} content - Content to evaluate
 * @param {Object} policy - Optional custom policy to use
 */
export const evaluateContent = async (content, policy = null) => {
  const body = { content };
  if (policy) {
    body.policy = policy;
  }

  return apiFetch('/api/policy/evaluate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

/**
 * Validate a policy configuration
 */
export const validatePolicy = async (policy) => {
  return apiFetch('/api/policy/validate', {
    method: 'POST',
    body: JSON.stringify({ policy }),
  });
};

/**
 * Get available evaluation strategies
 */
export const fetchStrategies = async () => {
  return apiFetch('/api/policy/strategies');
};

/**
 * Health check
 */
export const fetchHealth = async () => {
  return apiFetch('/api/policy/health');
};

/**
 * Set runtime policy override
 */
export const setRuntimePolicy = async (policy) => {
  return apiFetch('/api/policy/runtime', {
    method: 'POST',
    body: JSON.stringify({ policy }),
  });
};

/**
 * Clear runtime policy override
 */
export const clearRuntimePolicy = async () => {
  return apiFetch('/api/policy/runtime', {
    method: 'DELETE',
  });
};

export default {
  fetchConfig,
  updateConfig,
  reloadConfig,
  evaluateContent,
  validatePolicy,
  fetchStrategies,
  fetchHealth,
  setRuntimePolicy,
  clearRuntimePolicy,
};

