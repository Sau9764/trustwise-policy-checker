/**
 * JudgeService - LLM Judge abstraction for policy rule evaluation
 * 
 * Design Principles:
 * - Uses OpenAI SDK (consistent with existing codebase pattern)
 * - Supports configurable timeouts and retries with exponential backoff
 * - Circuit breaker pattern for graceful degradation
 * - Rate limit detection and handling
 * - Returns structured verdict responses
 * - Mockable for testing
 */

const OpenAI = require('openai');
const https = require('https');
const EventEmitter = require('events');

// Error types for categorization
const ERROR_TYPES = {
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER_ERROR: 'SERVER_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PARSE_ERROR: 'PARSE_ERROR',
  UNKNOWN: 'UNKNOWN'
};

// Circuit breaker states
const CIRCUIT_STATES = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Blocking requests
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

class JudgeService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || console;
    this.config = options.config || {};
    
    // Judge configuration
    this.model = this.config.model || 'gpt-4o-mini';
    this.temperature = this.config.temperature ?? 0.1;
    this.maxTokens = this.config.maxTokens || 500;
    this.timeout = this.config.timeout || 30000;
    this.maxRetries = this.config.maxRetries || 3;
    this.retryDelay = this.config.retryDelay || 1000;
    
    // Retry configuration (following RAGHttpClient pattern)
    this.retryConfig = {
      maxRetries: this.maxRetries,
      initialDelayMs: this.retryDelay,
      maxDelayMs: this.config.maxRetryDelay || 10000,
      backoffMultiplier: this.config.backoffMultiplier || 2,
      jitterFactor: 0.1 // Add 10% random jitter to prevent thundering herd
    };
    
    // Circuit breaker configuration (following PythonTranslationAdapter pattern)
    this.circuitBreaker = {
      state: CIRCUIT_STATES.CLOSED,
      failureCount: 0,
      failureThreshold: this.config.circuitBreakerThreshold || 5,
      resetTimeoutMs: this.config.circuitBreakerResetMs || 30000,
      lastFailureTime: null,
      halfOpenSuccessThreshold: 2,
      halfOpenSuccessCount: 0
    };
    
    // Rate limit tracking
    this.rateLimitState = {
      isLimited: false,
      retryAfterMs: 0,
      lastRateLimitTime: null
    };
    
    // Performance metrics
    this.metrics = {
      requests: 0,
      successes: 0,
      failures: 0,
      retries: 0,
      timeouts: 0,
      rateLimits: 0,
      circuitBreakerTrips: 0,
      totalLatency: 0
    };
    
    // API key
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY;
    
    // Mock mode for testing
    this.mockMode = options.mockMode || false;
    this.mockResponses = options.mockResponses || {};
    
    // Initialize OpenAI client if not in mock mode and API key is available
    if (!this.mockMode && this.apiKey) {
      this.initializeClient();
    } else if (!this.mockMode && !this.apiKey) {
      this.logger.warn('[JudgeService] OPENAI_API_KEY not configured - evaluations will fail until key is provided');
    }
    
    this.logger.info('[JudgeService] Initialized', {
      model: this.model,
      temperature: this.temperature,
      timeout: this.timeout,
      maxRetries: this.retryConfig.maxRetries,
      circuitBreakerThreshold: this.circuitBreaker.failureThreshold,
      mockMode: this.mockMode
    });
  }

  /**
   * Initialize the OpenAI client with connection pooling
   */
  initializeClient() {
    if (!this.apiKey) {
      this.logger.warn('[JudgeService] Cannot initialize OpenAI client - API key not configured');
      return;
    }

    const agentConfig = {
      keepAlive: true,
      maxSockets: 10,
      maxFreeSockets: 5,
      timeout: this.timeout,
      keepAliveMsecs: 30000,
      scheduling: 'lifo'
    };

    const httpAgent = new https.Agent(agentConfig);

    this.openai = new OpenAI({
      apiKey: this.apiKey,
      httpAgent: httpAgent,
      maxRetries: 0, // We handle retries ourselves
      timeout: this.timeout
    });

    this.logger.info('[JudgeService] OpenAI client initialized with connection pooling');
  }

  /**
   * Evaluate content against a rule using the LLM Judge
   * 
   * @param {Object} rule - Rule object with id, judge_prompt, etc.
   * @param {string} content - Content to evaluate
   * @returns {Promise<Object>} Verdict response
   */
  async evaluate(rule, content) {
    const startTime = Date.now();
    this.metrics.requests++;
    
    this.logger.info('[JudgeService] Evaluating rule', {
      ruleId: rule.id,
      contentLength: content.length,
      circuitState: this.circuitBreaker.state
    });

    // Emit evaluation start event
    this.emit('judge:evaluation-start', {
      ruleId: rule.id,
      timestamp: startTime
    });

    try {
      // Check circuit breaker before attempting request
      this.checkCircuitBreaker();
      
      let result;
      
      if (this.mockMode) {
        result = await this.evaluateMock(rule, content);
      } else {
        result = await this.evaluateWithRetry(rule, content);
      }
      
      const latency = Date.now() - startTime;
      this.metrics.successes++;
      this.metrics.totalLatency += latency;
      
      // Record success for circuit breaker
      this.recordSuccess();
      
      // Emit evaluation complete event
      this.emit('judge:evaluation-complete', {
        ruleId: rule.id,
        verdict: result.verdict,
        latency
      });
      
      return {
        ...result,
        latency_ms: latency
      };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.metrics.failures++;
      this.metrics.totalLatency += latency;
      
      // Categorize error and record failure
      const errorType = this.categorizeError(error);
      this.recordFailure(errorType, error);
      
      this.logger.error('[JudgeService] Evaluation failed', {
        ruleId: rule.id,
        error: error.message,
        errorType,
        latency,
        circuitState: this.circuitBreaker.state
      });
      
      // Emit evaluation error event
      this.emit('judge:evaluation-error', {
        ruleId: rule.id,
        error: error.message,
        errorType,
        latency
      });
      
      // Return UNCERTAIN verdict on error
      return {
        verdict: 'UNCERTAIN',
        confidence: 0,
        reasoning: `Evaluation failed: ${error.message}`,
        latency_ms: latency,
        error: error.message,
        errorType
      };
    }
  }

  /**
   * Check circuit breaker state before making request
   * @private
   */
  checkCircuitBreaker() {
    if (this.circuitBreaker.state === CIRCUIT_STATES.OPEN) {
      // Check if reset timeout has passed
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      
      if (timeSinceLastFailure >= this.circuitBreaker.resetTimeoutMs) {
        // Transition to half-open state
        this.circuitBreaker.state = CIRCUIT_STATES.HALF_OPEN;
        this.circuitBreaker.halfOpenSuccessCount = 0;
        this.logger.info('[JudgeService] Circuit breaker HALF_OPEN - testing service');
        this.emit('judge:circuit-half-open');
      } else {
        const remainingMs = this.circuitBreaker.resetTimeoutMs - timeSinceLastFailure;
        throw new Error(`Circuit breaker OPEN - service unavailable. Retry in ${Math.ceil(remainingMs / 1000)}s`);
      }
    }
  }

  /**
   * Record successful request for circuit breaker
   * @private
   */
  recordSuccess() {
    if (this.circuitBreaker.state === CIRCUIT_STATES.HALF_OPEN) {
      this.circuitBreaker.halfOpenSuccessCount++;
      
      if (this.circuitBreaker.halfOpenSuccessCount >= this.circuitBreaker.halfOpenSuccessThreshold) {
        // Fully recover circuit
        this.circuitBreaker.state = CIRCUIT_STATES.CLOSED;
        this.circuitBreaker.failureCount = 0;
        this.logger.info('[JudgeService] Circuit breaker CLOSED - service recovered');
        this.emit('judge:circuit-closed');
      }
    } else if (this.circuitBreaker.state === CIRCUIT_STATES.CLOSED) {
      // Reset failure count on success
      this.circuitBreaker.failureCount = 0;
    }
    
    // Clear rate limit state on success
    this.rateLimitState.isLimited = false;
  }

  /**
   * Record failed request for circuit breaker
   * @private
   */
  recordFailure(errorType, error) {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    // Track specific error types
    if (errorType === ERROR_TYPES.TIMEOUT) {
      this.metrics.timeouts++;
    } else if (errorType === ERROR_TYPES.RATE_LIMIT) {
      this.metrics.rateLimits++;
      this.handleRateLimit(error);
    }
    
    // Check if we should open the circuit
    if (this.circuitBreaker.state === CIRCUIT_STATES.HALF_OPEN) {
      // Immediate trip on half-open failure
      this.openCircuit();
    } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   * @private
   */
  openCircuit() {
    if (this.circuitBreaker.state !== CIRCUIT_STATES.OPEN) {
      this.circuitBreaker.state = CIRCUIT_STATES.OPEN;
      this.metrics.circuitBreakerTrips++;
      this.logger.error('[JudgeService] Circuit breaker OPEN - too many failures', {
        failureCount: this.circuitBreaker.failureCount,
        resetTimeoutMs: this.circuitBreaker.resetTimeoutMs
      });
      this.emit('judge:circuit-open', {
        failureCount: this.circuitBreaker.failureCount,
        resetTimeoutMs: this.circuitBreaker.resetTimeoutMs
      });
    }
  }

  /**
   * Handle rate limit response
   * @private
   */
  handleRateLimit(error) {
    this.rateLimitState.isLimited = true;
    this.rateLimitState.lastRateLimitTime = Date.now();
    
    // Try to parse Retry-After header from error
    const retryAfterMatch = error.message.match(/retry.?after[:\s]+(\d+)/i);
    if (retryAfterMatch) {
      this.rateLimitState.retryAfterMs = parseInt(retryAfterMatch[1], 10) * 1000;
    } else {
      // Default to 60 seconds for rate limits
      this.rateLimitState.retryAfterMs = 60000;
    }
    
    this.logger.warn('[JudgeService] Rate limit detected', {
      retryAfterMs: this.rateLimitState.retryAfterMs
    });
  }

  /**
   * Categorize error type for proper handling
   * @private
   */
  categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Timeout errors
    if (message.includes('timeout') || 
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET') {
      return ERROR_TYPES.TIMEOUT;
    }
    
    // Rate limit errors (429)
    if (status === 429 || 
        message.includes('rate limit') || 
        message.includes('too many requests') ||
        message.includes('quota')) {
      return ERROR_TYPES.RATE_LIMIT;
    }
    
    // Server errors (5xx)
    if (status >= 500 && status < 600) {
      return ERROR_TYPES.SERVER_ERROR;
    }
    
    // Auth errors (401, 403)
    if (status === 401 || status === 403 || 
        message.includes('unauthorized') ||
        message.includes('invalid api key')) {
      return ERROR_TYPES.AUTH_ERROR;
    }
    
    // Network errors
    if (message.includes('enotfound') ||
        message.includes('econnrefused') ||
        message.includes('network') ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return ERROR_TYPES.NETWORK_ERROR;
    }
    
    // Parse errors
    if (message.includes('json') || message.includes('parse')) {
      return ERROR_TYPES.PARSE_ERROR;
    }
    
    return ERROR_TYPES.UNKNOWN;
  }

  /**
   * Check if error is retryable
   * @private
   */
  isRetryableError(errorType) {
    // Retry on transient errors, not on auth or parse errors
    return [
      ERROR_TYPES.TIMEOUT,
      ERROR_TYPES.RATE_LIMIT,
      ERROR_TYPES.SERVER_ERROR,
      ERROR_TYPES.NETWORK_ERROR
    ].includes(errorType);
  }

  /**
   * Calculate delay for retry with exponential backoff and jitter
   * @private
   */
  calculateRetryDelay(attempt, errorType) {
    let baseDelay = this.retryConfig.initialDelayMs * 
                    Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    
    // Use longer delay for rate limits
    if (errorType === ERROR_TYPES.RATE_LIMIT && this.rateLimitState.retryAfterMs > 0) {
      baseDelay = Math.max(baseDelay, this.rateLimitState.retryAfterMs);
    }
    
    // Cap at max delay
    baseDelay = Math.min(baseDelay, this.retryConfig.maxDelayMs);
    
    // Add jitter to prevent thundering herd
    const jitter = baseDelay * this.retryConfig.jitterFactor * Math.random();
    
    return Math.floor(baseDelay + jitter);
  }

  /**
   * Evaluate with retry logic and improved error handling
   * @private
   */
  async evaluateWithRetry(rule, content) {
    // Check if OpenAI client is initialized
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY not configured - cannot evaluate content');
    }
    
    let lastError;
    let lastErrorType = ERROR_TYPES.UNKNOWN;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.evaluateLLM(rule, content);
      } catch (error) {
        lastError = error;
        lastErrorType = this.categorizeError(error);
        
        this.logger.warn('[JudgeService] Evaluation attempt failed', {
          ruleId: rule.id,
          attempt,
          maxRetries: this.retryConfig.maxRetries,
          error: error.message,
          errorType: lastErrorType
        });
        
        // Don't retry non-retryable errors
        if (!this.isRetryableError(lastErrorType)) {
          this.logger.warn('[JudgeService] Non-retryable error, aborting retries', {
            errorType: lastErrorType
          });
          throw error;
        }
        
        // Calculate delay and wait before retrying
        if (attempt < this.retryConfig.maxRetries) {
          this.metrics.retries++;
          const delay = this.calculateRetryDelay(attempt, lastErrorType);
          
          this.logger.info('[JudgeService] Retrying after delay', {
            ruleId: rule.id,
            attempt,
            delayMs: delay,
            errorType: lastErrorType
          });
          
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Call LLM for evaluation
   * @private
   */
  async evaluateLLM(rule, content) {
    const systemPrompt = `You are a content moderation judge. Evaluate the provided content against the given rule and respond with a structured JSON verdict.

RULE: ${rule.description}
CRITERIA: ${rule.judge_prompt}

You MUST respond with ONLY a valid JSON object in this exact format:
{
  "verdict": "PASS" or "FAIL" or "UNCERTAIN",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of your decision"
}

Guidelines:
- PASS: Content clearly meets the criteria
- FAIL: Content clearly violates the criteria
- UNCERTAIN: Cannot determine with confidence (edge case or ambiguous)
- confidence: How certain you are (0.0 = no confidence, 1.0 = fully certain)
- reasoning: 1-2 sentence explanation`;

    const userPrompt = `Evaluate this content:\n\n${content}`;

    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: { type: 'json_object' }
    });

    const responseText = response.choices[0]?.message?.content || '';
    
    try {
      const parsed = JSON.parse(responseText);
      
      // Validate response structure
      const verdict = this.normalizeVerdict(parsed.verdict);
      const confidence = this.normalizeConfidence(parsed.confidence);
      const reasoning = parsed.reasoning || 'No reasoning provided';
      
      return {
        verdict,
        confidence,
        reasoning
      };
      
    } catch (parseError) {
      this.logger.error('[JudgeService] Failed to parse LLM response', {
        ruleId: rule.id,
        responseText,
        error: parseError.message
      });
      
      // Attempt to extract verdict from raw text
      return this.extractVerdictFromText(responseText);
    }
  }

  /**
   * Mock evaluation for testing
   * @private
   */
  async evaluateMock(rule, content) {
    // Check if there's a specific mock response for this rule
    if (this.mockResponses[rule.id]) {
      const mockResponse = this.mockResponses[rule.id];
      
      // If it's a function, call it with content
      if (typeof mockResponse === 'function') {
        return mockResponse(content);
      }
      
      // If it's a promise rejection (for timeout testing)
      if (mockResponse.timeout) {
        await this.sleep(mockResponse.timeout);
        throw new Error('Request timeout');
      }
      
      // Simulate rate limit
      if (mockResponse.rateLimit) {
        const error = new Error('Rate limit exceeded');
        error.status = 429;
        throw error;
      }
      
      // Simulate circuit breaker
      if (mockResponse.circuitBreaker) {
        this.circuitBreaker.failureCount = this.circuitBreaker.failureThreshold;
        this.openCircuit();
        throw new Error('Circuit breaker OPEN');
      }
      
      return mockResponse;
    }
    
    // Default mock response - PASS
    return {
      verdict: 'PASS',
      confidence: 0.9,
      reasoning: 'Mock evaluation - content appears acceptable'
    };
  }

  /**
   * Normalize verdict to valid values
   * @private
   */
  normalizeVerdict(verdict) {
    if (!verdict) return 'UNCERTAIN';
    
    const normalized = String(verdict).toUpperCase().trim();
    
    if (['PASS', 'PASSED', 'OK', 'CLEAN', 'SAFE'].includes(normalized)) {
      return 'PASS';
    }
    
    if (['FAIL', 'FAILED', 'VIOLATION', 'UNSAFE', 'BLOCKED'].includes(normalized)) {
      return 'FAIL';
    }
    
    return 'UNCERTAIN';
  }

  /**
   * Normalize confidence to 0-1 range
   * @private
   */
  normalizeConfidence(confidence) {
    if (confidence === undefined || confidence === null) {
      return 0.5;
    }
    
    const num = parseFloat(confidence);
    
    if (isNaN(num)) {
      return 0.5;
    }
    
    // Handle percentage format (0-100)
    if (num > 1) {
      return Math.min(1, num / 100);
    }
    
    return Math.max(0, Math.min(1, num));
  }

  /**
   * Extract verdict from raw text when JSON parsing fails
   * @private
   */
  extractVerdictFromText(text) {
    const upperText = text.toUpperCase();
    
    let verdict = 'UNCERTAIN';
    if (upperText.includes('PASS')) {
      verdict = 'PASS';
    } else if (upperText.includes('FAIL')) {
      verdict = 'FAIL';
    }
    
    return {
      verdict,
      confidence: 0.5,
      reasoning: text.substring(0, 200)
    };
  }

  /**
   * Sleep utility for retry delays
   * @private
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration at runtime
   * @param {Object} newConfig - New configuration
   */
  updateConfig(newConfig) {
    if (newConfig.model) this.model = newConfig.model;
    if (newConfig.temperature !== undefined) this.temperature = newConfig.temperature;
    if (newConfig.maxTokens) this.maxTokens = newConfig.maxTokens;
    if (newConfig.timeout) this.timeout = newConfig.timeout;
    if (newConfig.maxRetries) {
      this.maxRetries = newConfig.maxRetries;
      this.retryConfig.maxRetries = newConfig.maxRetries;
    }
    if (newConfig.retryDelay) {
      this.retryDelay = newConfig.retryDelay;
      this.retryConfig.initialDelayMs = newConfig.retryDelay;
    }
    if (newConfig.circuitBreakerThreshold) {
      this.circuitBreaker.failureThreshold = newConfig.circuitBreakerThreshold;
    }
    if (newConfig.circuitBreakerResetMs) {
      this.circuitBreaker.resetTimeoutMs = newConfig.circuitBreakerResetMs;
    }
    
    this.logger.info('[JudgeService] Configuration updated', {
      model: this.model,
      temperature: this.temperature,
      timeout: this.timeout,
      circuitBreakerThreshold: this.circuitBreaker.failureThreshold
    });
  }

  /**
   * Set mock mode for testing
   * @param {boolean} enabled - Enable/disable mock mode
   * @param {Object} responses - Mock responses keyed by rule ID
   */
  setMockMode(enabled, responses = {}) {
    this.mockMode = enabled;
    this.mockResponses = responses;
    
    this.logger.info('[JudgeService] Mock mode', {
      enabled,
      responseCount: Object.keys(responses).length
    });
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getMetrics() {
    const avgLatency = this.metrics.requests > 0
      ? (this.metrics.totalLatency / this.metrics.requests).toFixed(2)
      : 0;
    
    return {
      ...this.metrics,
      averageLatency: `${avgLatency}ms`,
      successRate: this.metrics.requests > 0
        ? `${((this.metrics.successes / this.metrics.requests) * 100).toFixed(2)}%`
        : '0.00%',
      circuitState: this.circuitBreaker.state,
      circuitFailureCount: this.circuitBreaker.failureCount,
      isRateLimited: this.rateLimitState.isLimited
    };
  }

  /**
   * Reset circuit breaker manually (for recovery)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.state = CIRCUIT_STATES.CLOSED;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.halfOpenSuccessCount = 0;
    this.rateLimitState.isLimited = false;
    
    this.logger.info('[JudgeService] Circuit breaker manually reset');
    this.emit('judge:circuit-reset');
  }

  /**
   * Health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    if (this.mockMode) {
      return { 
        healthy: true, 
        mode: 'mock',
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    }
    
    if (!this.openai) {
      return {
        healthy: false,
        mode: 'live',
        error: 'OPENAI_API_KEY not configured',
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    }
    
    // Check circuit breaker state
    if (this.circuitBreaker.state === CIRCUIT_STATES.OPEN) {
      return {
        healthy: false,
        mode: 'live',
        error: 'Circuit breaker is OPEN',
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    }
    
    try {
      // Simple API check
      const response = await this.openai.models.list();
      return {
        healthy: true,
        mode: 'live',
        model: this.model,
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    } catch (error) {
      return {
        healthy: false,
        mode: 'live',
        error: error.message,
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    }
  }
}

// Export error types for external use
JudgeService.ERROR_TYPES = ERROR_TYPES;
JudgeService.CIRCUIT_STATES = CIRCUIT_STATES;

module.exports = JudgeService;
