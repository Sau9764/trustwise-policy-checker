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
 * Add a new rule to the policy
 * @param {Object} rule - Rule object with id, description, judge_prompt, on_fail, weight
 */
export const addRule = async (rule) => {
  return apiFetch('/api/policy/rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  });
};

/**
 * Update an existing rule
 * @param {string} ruleId - ID of the rule to update
 * @param {Object} updates - Fields to update
 */
export const updateRule = async (ruleId, updates) => {
  return apiFetch(`/api/policy/rules/${encodeURIComponent(ruleId)}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete a rule from the policy
 * @param {string} ruleId - ID of the rule to delete
 */
export const deleteRule = async (ruleId) => {
  return apiFetch(`/api/policy/rules/${encodeURIComponent(ruleId)}`, {
    method: 'DELETE',
  });
};

// ============================================
// History API Endpoints
// ============================================

/**
 * Fetch evaluation history with pagination and filters
 * @param {Object} options - Query options
 * @param {number} options.page - Page number (default: 1)
 * @param {number} options.limit - Items per page (default: 20)
 * @param {string} options.policyName - Filter by policy name
 * @param {string} options.verdict - Filter by verdict (ALLOW, BLOCK, WARN, REDACT, ERROR)
 * @param {string} options.startDate - Filter from date (ISO string)
 * @param {string} options.endDate - Filter to date (ISO string)
 * @param {string} options.search - Search term
 */
export const fetchHistory = async (options = {}) => {
  const params = new URLSearchParams();
  
  if (options.page) params.append('page', options.page.toString());
  if (options.limit) params.append('limit', options.limit.toString());
  if (options.policyName) params.append('policyName', options.policyName);
  if (options.verdict) params.append('verdict', options.verdict);
  if (options.startDate) params.append('startDate', options.startDate);
  if (options.endDate) params.append('endDate', options.endDate);
  if (options.search) params.append('search', options.search);
  if (options.tags) params.append('tags', options.tags.join(','));

  const queryString = params.toString();
  const endpoint = queryString ? `/api/history?${queryString}` : '/api/history';
  
  return apiFetch(endpoint);
};

/**
 * Get evaluation history statistics
 */
export const fetchHistoryStats = async () => {
  return apiFetch('/api/history/stats');
};

/**
 * Get a specific evaluation by ID
 * @param {string} evaluationId - The evaluation ID
 */
export const getEvaluation = async (evaluationId) => {
  return apiFetch(`/api/history/${encodeURIComponent(evaluationId)}`);
};

/**
 * Re-run a past evaluation with the same policy and content
 * @param {string} evaluationId - The evaluation ID to re-run
 * @param {Object} options - Re-run options
 * @param {boolean} options.saveToHistory - Whether to save the new result (default: true)
 */
export const rerunEvaluation = async (evaluationId, options = {}) => {
  return apiFetch(`/api/history/${encodeURIComponent(evaluationId)}/rerun`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
};

/**
 * Delete an evaluation from history
 * @param {string} evaluationId - The evaluation ID to delete
 */
export const deleteEvaluation = async (evaluationId) => {
  return apiFetch(`/api/history/${encodeURIComponent(evaluationId)}`, {
    method: 'DELETE',
  });
};

/**
 * Delete multiple evaluations from history
 * @param {string[]} evaluationIds - Array of evaluation IDs to delete
 */
export const deleteEvaluations = async (evaluationIds) => {
  return apiFetch('/api/history/batch', {
    method: 'DELETE',
    body: JSON.stringify({ evaluationIds }),
  });
};

/**
 * Update tags for an evaluation
 * @param {string} evaluationId - The evaluation ID
 * @param {string[]} tags - Array of tags
 */
export const updateEvaluationTags = async (evaluationId, tags) => {
  return apiFetch(`/api/history/${encodeURIComponent(evaluationId)}/tags`, {
    method: 'PATCH',
    body: JSON.stringify({ tags }),
  });
};

/**
 * Update notes for an evaluation
 * @param {string} evaluationId - The evaluation ID
 * @param {string} notes - Notes text
 */
export const updateEvaluationNotes = async (evaluationId, notes) => {
  return apiFetch(`/api/history/${encodeURIComponent(evaluationId)}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
};

export default {
  fetchConfig,
  updateConfig,
  reloadConfig,
  evaluateContent,
  validatePolicy,
  addRule,
  updateRule,
  deleteRule,
  // History endpoints
  fetchHistory,
  fetchHistoryStats,
  getEvaluation,
  rerunEvaluation,
  deleteEvaluation,
  deleteEvaluations,
  updateEvaluationTags,
  updateEvaluationNotes,
};


