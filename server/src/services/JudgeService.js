/**
 * JudgeService - LLM Judge abstraction for policy rule evaluation
 * 
 * Design Principles:
 * - Uses OpenAI SDK (consistent with existing codebase pattern)
 * - Supports configurable timeouts and retries
 * - Returns structured verdict responses
 * - Mockable for testing
 */

const OpenAI = require('openai');
const https = require('https');
const EventEmitter = require('events');

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
      maxRetries: this.maxRetries,
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
    
    this.logger.info('[JudgeService] Evaluating rule', {
      ruleId: rule.id,
      contentLength: content.length
    });

    // Emit evaluation start event
    this.emit('judge:evaluation-start', {
      ruleId: rule.id,
      timestamp: startTime
    });

    try {
      let result;
      
      if (this.mockMode) {
        result = await this.evaluateMock(rule, content);
      } else {
        result = await this.evaluateWithRetry(rule, content);
      }
      
      const latency = Date.now() - startTime;
      
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
      
      this.logger.error('[JudgeService] Evaluation failed', {
        ruleId: rule.id,
        error: error.message,
        latency
      });
      
      // Emit evaluation error event
      this.emit('judge:evaluation-error', {
        ruleId: rule.id,
        error: error.message,
        latency
      });
      
      // Return UNCERTAIN verdict on error
      return {
        verdict: 'UNCERTAIN',
        confidence: 0,
        reasoning: `Evaluation failed: ${error.message}`,
        latency_ms: latency,
        error: error.message
      };
    }
  }

  /**
   * Evaluate with retry logic
   * @private
   */
  async evaluateWithRetry(rule, content) {
    // Check if OpenAI client is initialized
    if (!this.openai) {
      throw new Error('OPENAI_API_KEY not configured - cannot evaluate content');
    }
    
    let lastError;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.evaluateLLM(rule, content);
      } catch (error) {
        lastError = error;
        
        this.logger.warn('[JudgeService] Evaluation attempt failed', {
          ruleId: rule.id,
          attempt,
          maxRetries: this.maxRetries,
          error: error.message
        });
        
        // Don't retry on timeout - it's likely to timeout again
        if (error.message.includes('timeout') || error.code === 'ETIMEDOUT') {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1);
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
    if (newConfig.maxRetries) this.maxRetries = newConfig.maxRetries;
    if (newConfig.retryDelay) this.retryDelay = newConfig.retryDelay;
    
    this.logger.info('[JudgeService] Configuration updated', {
      model: this.model,
      temperature: this.temperature,
      timeout: this.timeout
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
   * Health check
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    if (this.mockMode) {
      return { healthy: true, mode: 'mock' };
    }
    
    if (!this.openai) {
      return {
        healthy: false,
        mode: 'live',
        error: 'OPENAI_API_KEY not configured'
      };
    }
    
    try {
      // Simple API check
      const response = await this.openai.models.list();
      return {
        healthy: true,
        mode: 'live',
        model: this.model
      };
    } catch (error) {
      return {
        healthy: false,
        mode: 'live',
        error: error.message
      };
    }
  }
}

module.exports = JudgeService;


