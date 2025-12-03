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

import OpenAI from 'openai';
import https from 'https';
import { EventEmitter } from 'events';
import type {
  Logger,
  JudgeConfig,
  Rule,
  JudgeEvaluationResult,
  JudgeServiceOptions,
  MockResponses,
  MockResponse,
  RetryConfig,
  CircuitBreakerConfig,
  RateLimitState,
  JudgeMetrics,
  JudgeMetricsReport,
  HealthCheckResult,
  Verdict,
  JudgeServiceInterface
} from '../types';
import { ErrorType, CircuitState } from '../types';

interface ExtendedError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
}

export class JudgeService extends EventEmitter implements JudgeServiceInterface {
  private logger: Logger;
  private config: Partial<JudgeConfig>;
  
  // Judge configuration
  private model: string;
  private temperature: number;
  private maxTokens: number;
  private timeout: number;
  private maxRetries: number;
  private retryDelay: number;
  
  // Retry configuration
  private retryConfig: RetryConfig;
  
  // Circuit breaker configuration
  private circuitBreaker: CircuitBreakerConfig;
  
  // Rate limit tracking
  private rateLimitState: RateLimitState;
  
  // Performance metrics
  private metrics: JudgeMetrics;
  
  // API key
  private apiKey?: string;
  
  // Mock mode for testing
  private mockMode: boolean;
  private mockResponses: MockResponses;
  
  // OpenAI client
  private openai?: OpenAI;

  constructor(options: JudgeServiceOptions = {}) {
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
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: this.maxRetries,
      initialDelayMs: this.retryDelay,
      maxDelayMs: this.config.maxRetryDelay || 10000,
      backoffMultiplier: this.config.backoffMultiplier || 2,
      jitterFactor: 0.1 // Add 10% random jitter to prevent thundering herd
    };
    
    // Circuit breaker configuration
    this.circuitBreaker = {
      state: CircuitState.CLOSED,
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
    this.apiKey = options.apiKey || process.env['OPENAI_API_KEY'];
    
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
  private initializeClient(): void {
    if (!this.apiKey) {
      this.logger.warn('[JudgeService] Cannot initialize OpenAI client - API key not configured');
      return;
    }

    const agentConfig: https.AgentOptions = {
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
   */
  async evaluate(rule: Rule, content: string): Promise<JudgeEvaluationResult> {
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
      
      let result: JudgeEvaluationResult;
      
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
      const extendedError = error as ExtendedError;
      const errorType = this.categorizeError(extendedError);
      this.recordFailure(errorType, extendedError);
      
      this.logger.error('[JudgeService] Evaluation failed', {
        ruleId: rule.id,
        error: extendedError.message,
        errorType,
        latency,
        circuitState: this.circuitBreaker.state
      });
      
      // Emit evaluation error event
      this.emit('judge:evaluation-error', {
        ruleId: rule.id,
        error: extendedError.message,
        errorType,
        latency
      });
      
      // Return UNCERTAIN verdict on error
      return {
        verdict: 'UNCERTAIN',
        confidence: 0,
        reasoning: `Evaluation failed: ${extendedError.message}`,
        latency_ms: latency,
        error: extendedError.message,
        errorType
      };
    }
  }

  /**
   * Check circuit breaker state before making request
   */
  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === CircuitState.OPEN) {
      // Check if reset timeout has passed
      const timeSinceLastFailure = Date.now() - (this.circuitBreaker.lastFailureTime || 0);
      
      if (timeSinceLastFailure >= this.circuitBreaker.resetTimeoutMs) {
        // Transition to half-open state
        this.circuitBreaker.state = CircuitState.HALF_OPEN;
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
   */
  private recordSuccess(): void {
    if (this.circuitBreaker.state === CircuitState.HALF_OPEN) {
      this.circuitBreaker.halfOpenSuccessCount++;
      
      if (this.circuitBreaker.halfOpenSuccessCount >= this.circuitBreaker.halfOpenSuccessThreshold) {
        // Fully recover circuit
        this.circuitBreaker.state = CircuitState.CLOSED;
        this.circuitBreaker.failureCount = 0;
        this.logger.info('[JudgeService] Circuit breaker CLOSED - service recovered');
        this.emit('judge:circuit-closed');
      }
    } else if (this.circuitBreaker.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.circuitBreaker.failureCount = 0;
    }
    
    // Clear rate limit state on success
    this.rateLimitState.isLimited = false;
  }

  /**
   * Record failed request for circuit breaker
   */
  private recordFailure(errorType: ErrorType, error: ExtendedError): void {
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    // Track specific error types
    if (errorType === ErrorType.TIMEOUT) {
      this.metrics.timeouts++;
    } else if (errorType === ErrorType.RATE_LIMIT) {
      this.metrics.rateLimits++;
      this.handleRateLimit(error);
    }
    
    // Check if we should open the circuit
    if (this.circuitBreaker.state === CircuitState.HALF_OPEN) {
      // Immediate trip on half-open failure
      this.openCircuit();
    } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.failureThreshold) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    if (this.circuitBreaker.state !== CircuitState.OPEN) {
      this.circuitBreaker.state = CircuitState.OPEN;
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
   */
  private handleRateLimit(error: ExtendedError): void {
    this.rateLimitState.isLimited = true;
    this.rateLimitState.lastRateLimitTime = Date.now();
    
    // Try to parse Retry-After header from error
    const retryAfterMatch = error.message.match(/retry.?after[:\s]+(\d+)/i);
    if (retryAfterMatch?.[1]) {
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
   */
  private categorizeError(error: ExtendedError): ErrorType {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;
    
    // Timeout errors
    if (message.includes('timeout') || 
        message.includes('etimedout') ||
        message.includes('econnreset') ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET') {
      return ErrorType.TIMEOUT;
    }
    
    // Rate limit errors (429)
    if (status === 429 || 
        message.includes('rate limit') || 
        message.includes('too many requests') ||
        message.includes('quota')) {
      return ErrorType.RATE_LIMIT;
    }
    
    // Server errors (5xx)
    if (status && status >= 500 && status < 600) {
      return ErrorType.SERVER_ERROR;
    }
    
    // Auth errors (401, 403)
    if (status === 401 || status === 403 || 
        message.includes('unauthorized') ||
        message.includes('invalid api key')) {
      return ErrorType.AUTH_ERROR;
    }
    
    // Network errors
    if (message.includes('enotfound') ||
        message.includes('econnrefused') ||
        message.includes('network') ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED') {
      return ErrorType.NETWORK_ERROR;
    }
    
    // Parse errors
    if (message.includes('json') || message.includes('parse')) {
      return ErrorType.PARSE_ERROR;
    }
    
    return ErrorType.UNKNOWN;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(errorType: ErrorType): boolean {
    // Retry on transient errors, not on auth or parse errors
    return [
      ErrorType.TIMEOUT,
      ErrorType.RATE_LIMIT,
      ErrorType.SERVER_ERROR,
      ErrorType.NETWORK_ERROR
    ].includes(errorType);
  }

  /**
   * Calculate delay for retry with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number, errorType: ErrorType): number {
    let baseDelay = this.retryConfig.initialDelayMs * 
                    Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);
    
    // Use longer delay for rate limits
    if (errorType === ErrorType.RATE_LIMIT && this.rateLimitState.retryAfterMs > 0) {
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
   */
  private async evaluateWithRetry(rule: Rule, content: string): Promise<JudgeEvaluationResult> {
    // Check if OpenAI client is initialized
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY not configured - cannot evaluate content');
    }
    
    let lastError: ExtendedError = new Error('Unknown error');
    let lastErrorType: ErrorType = ErrorType.UNKNOWN;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await this.evaluateLLM(rule, content);
      } catch (error) {
        lastError = error as ExtendedError;
        lastErrorType = this.categorizeError(lastError);
        
        this.logger.warn('[JudgeService] Evaluation attempt failed', {
          ruleId: rule.id,
          attempt,
          maxRetries: this.retryConfig.maxRetries,
          error: lastError.message,
          errorType: lastErrorType
        });
        
        // Don't retry non-retryable errors
        if (!this.isRetryableError(lastErrorType)) {
          this.logger.warn('[JudgeService] Non-retryable error, aborting retries', {
            errorType: lastErrorType
          });
          throw lastError;
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
   */
  private async evaluateLLM(rule: Rule, content: string): Promise<JudgeEvaluationResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const systemPrompt = `You are a content moderation judge. Evaluate the provided content against the given rule and respond with a structured JSON verdict.

RULE: ${rule.description || ''}
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
      const parsed = JSON.parse(responseText) as {
        verdict?: string;
        confidence?: number | string;
        reasoning?: string;
      };
      
      // Validate response structure
      const verdict = this.normalizeVerdict(parsed.verdict);
      const confidence = this.normalizeConfidence(parsed.confidence);
      const reasoning = parsed.reasoning || 'No reasoning provided';
      
      return {
        verdict,
        confidence,
        reasoning
      };
      
    } catch {
      this.logger.error('[JudgeService] Failed to parse LLM response', {
        ruleId: rule.id,
        responseText
      });
      
      // Attempt to extract verdict from raw text
      return this.extractVerdictFromText(responseText);
    }
  }

  /**
   * Mock evaluation for testing
   */
  private async evaluateMock(rule: Rule, content: string): Promise<JudgeEvaluationResult> {
    // Check if there's a specific mock response for this rule
    const mockResponse = this.mockResponses[rule.id];
    
    if (mockResponse) {
      // If it's a function, call it with content
      if (typeof mockResponse === 'function') {
        return mockResponse(content);
      }
      
      const response = mockResponse as MockResponse;
      
      // If it's a promise rejection (for timeout testing)
      if (response.timeout) {
        await this.sleep(response.timeout);
        throw new Error('Request timeout');
      }
      
      // Simulate rate limit
      if (response.rateLimit) {
        const error = new Error('Rate limit exceeded') as ExtendedError;
        error.status = 429;
        throw error;
      }
      
      // Simulate circuit breaker
      if (response.circuitBreaker) {
        this.circuitBreaker.failureCount = this.circuitBreaker.failureThreshold;
        this.openCircuit();
        throw new Error('Circuit breaker OPEN');
      }
      
      return {
        verdict: response.verdict || 'PASS',
        confidence: response.confidence || 0.9,
        reasoning: response.reasoning || 'Mock evaluation'
      };
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
   */
  private normalizeVerdict(verdict?: string): Verdict {
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
   */
  private normalizeConfidence(confidence?: number | string): number {
    if (confidence === undefined || confidence === null) {
      return 0.5;
    }
    
    const num = parseFloat(String(confidence));
    
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
   */
  private extractVerdictFromText(text: string): JudgeEvaluationResult {
    const upperText = text.toUpperCase();
    
    let verdict: Verdict = 'UNCERTAIN';
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
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(newConfig: Partial<JudgeConfig>): void {
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
   */
  setMockMode(enabled: boolean, responses: MockResponses = {}): void {
    this.mockMode = enabled;
    this.mockResponses = responses;
    
    this.logger.info('[JudgeService] Mock mode', {
      enabled,
      responseCount: Object.keys(responses).length
    });
  }

  /**
   * Get performance metrics
   */
  getMetrics(): JudgeMetricsReport {
    const avgLatency = this.metrics.requests > 0
      ? (this.metrics.totalLatency / this.metrics.requests).toFixed(2)
      : '0';
    
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
  resetCircuitBreaker(): void {
    this.circuitBreaker.state = CircuitState.CLOSED;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.halfOpenSuccessCount = 0;
    this.rateLimitState.isLimited = false;
    
    this.logger.info('[JudgeService] Circuit breaker manually reset');
    this.emit('judge:circuit-reset');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
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
    if (this.circuitBreaker.state === CircuitState.OPEN) {
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
      await this.openai.models.list();
      return {
        healthy: true,
        mode: 'live',
        model: this.model,
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    } catch (error) {
      const err = error as Error;
      return {
        healthy: false,
        mode: 'live',
        error: err.message,
        circuitState: this.circuitBreaker.state,
        metrics: this.getMetrics()
      };
    }
  }

  // Static properties for external access
  static readonly ERROR_TYPES = ErrorType;
  static readonly CIRCUIT_STATES = CircuitState;
}

export default JudgeService;

