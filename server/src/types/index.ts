/**
 * Trustwise - Type Definitions
 * 
 * Comprehensive TypeScript types for the Policy Engine
 */

// ============================================
// Verdict & Action Types
// ============================================

export type Verdict = 'PASS' | 'FAIL' | 'UNCERTAIN';
export type FinalVerdict = 'ALLOW' | 'BLOCK' | 'WARN' | 'REDACT' | 'ERROR';
export type Action = 'allow' | 'block' | 'warn' | 'redact';
export type EvaluationStrategy = 'all' | 'any' | 'weighted_threshold';

// ============================================
// Rule Types
// ============================================

export interface Rule {
  id: string;
  description?: string;
  judge_prompt: string;
  on_fail: Action;
  weight?: number;
}

export interface RuleInput {
  id: string;
  description?: string;
  judge_prompt: string;
  on_fail?: Action;
  weight?: number;
}

export interface RulePartial {
  id?: string;
  description?: string;
  judge_prompt?: string;
  on_fail?: Action;
  weight?: number;
}

// ============================================
// Policy Types
// ============================================

export interface Policy {
  name: string;
  version?: string;
  default_action: Action;
  rules: Rule[];
  evaluation_strategy: EvaluationStrategy;
  threshold?: number;
}

export interface PolicyInput {
  name?: string;
  version?: string;
  default_action?: Action;
  rules?: RulePartial[];
  evaluation_strategy?: EvaluationStrategy;
  threshold?: number;
}

// ============================================
// Configuration Types
// ============================================

export interface JudgeConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  maxRetryDelay?: number;
  backoffMultiplier?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export interface EngineSettings {
  parallelEvaluation: boolean;
  debugLog: boolean;
  cacheResults: boolean;
}

export interface Config {
  policy: Policy;
  judge: JudgeConfig;
  settings: EngineSettings;
  apiKey?: string;
}

export interface BaseConfig {
  policy: Policy;
  judge: JudgeConfig;
  settings: EngineSettings;
}

// ============================================
// Evaluation Result Types
// ============================================

export interface JudgeEvaluationResult {
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  latency_ms?: number;
  error?: string;
  errorType?: ErrorType;
}

export interface RuleResult {
  rule_id: string;
  verdict: Verdict;
  confidence: number;
  reasoning: string;
  action: Action;
  weight: number;
  latency_ms: number;
  error?: string;
  errorType?: ErrorType;
}

export interface AggregationSummary {
  total_rules: number;
  passed: number;
  failed: number;
  uncertain: number;
  strategy: EvaluationStrategy;
  reason: string;
  score?: number;
  threshold?: number;
}

export interface AggregationResult {
  final_verdict: FinalVerdict;
  passed: boolean;
  summary: AggregationSummary;
}

export interface PolicyVerdict {
  policy_name: string;
  policy_version?: string;
  final_verdict: FinalVerdict;
  passed: boolean;
  evaluated_at: string;
  rule_results: RuleResult[];
  summary?: AggregationSummary;
  error?: string;
  total_latency_ms: number;
}

// ============================================
// Validation Types
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface RuleOperationResult {
  success: boolean;
  message?: string;
  rule?: Rule;
  deletedRule?: Rule;
}

// ============================================
// Error Types
// ============================================

export enum ErrorType {
  TIMEOUT = 'TIMEOUT',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  UNKNOWN = 'UNKNOWN'
}

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

// ============================================
// Service Types
// ============================================

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterFactor: number;
}

export interface CircuitBreakerConfig {
  state: CircuitState;
  failureCount: number;
  failureThreshold: number;
  resetTimeoutMs: number;
  lastFailureTime: number | null;
  halfOpenSuccessThreshold: number;
  halfOpenSuccessCount: number;
}

export interface RateLimitState {
  isLimited: boolean;
  retryAfterMs: number;
  lastRateLimitTime: number | null;
}

export interface JudgeMetrics {
  requests: number;
  successes: number;
  failures: number;
  retries: number;
  timeouts: number;
  rateLimits: number;
  circuitBreakerTrips: number;
  totalLatency: number;
}

export interface JudgeMetricsReport extends JudgeMetrics {
  averageLatency: string;
  successRate: string;
  circuitState: CircuitState;
  circuitFailureCount: number;
  isRateLimited: boolean;
}

export interface HealthCheckResult {
  healthy: boolean;
  mode?: 'mock' | 'live';
  model?: string;
  error?: string;
  circuitState: CircuitState;
  metrics: JudgeMetricsReport;
}

export interface PolicyEngineHealthCheck {
  healthy: boolean;
  engine: {
    policyName: string;
    rulesCount: number;
    strategy: EvaluationStrategy;
    parallelEvaluation: boolean;
  };
  judge: HealthCheckResult;
  availableStrategies: EvaluationStrategy[];
}

// ============================================
// Mock Types (for testing)
// ============================================

export interface MockResponse {
  verdict?: Verdict;
  confidence?: number;
  reasoning?: string;
  timeout?: number;
  rateLimit?: boolean;
  circuitBreaker?: boolean;
}

export type MockResponseFunction = (content: string) => JudgeEvaluationResult;

export type MockResponses = Record<string, MockResponse | MockResponseFunction>;

// ============================================
// Options Types
// ============================================

export interface JudgeServiceOptions {
  logger?: Logger;
  config?: Partial<JudgeConfig>;
  apiKey?: string;
  mockMode?: boolean;
  mockResponses?: MockResponses;
}

export interface PolicyEngineOptions {
  logger?: Logger;
  config?: Config;
  judgeService?: JudgeServiceInterface;
  mockMode?: boolean;
  mockResponses?: MockResponses;
}

export interface EvaluateOptions {
  policy?: Policy;
}

export interface InitializeOptions {
  logger?: Logger;
  mockMode?: boolean;
  mockResponses?: MockResponses;
}

export interface PolicyRoutesOptions {
  logger?: Logger;
}

// ============================================
// Logger Interface
// ============================================

export interface Logger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  log: (message: string, meta?: Record<string, unknown>) => void;
}

// ============================================
// Service Interfaces
// ============================================

export interface JudgeServiceInterface {
  evaluate(rule: Rule, content: string): Promise<JudgeEvaluationResult>;
  updateConfig(newConfig: Partial<JudgeConfig>): void;
  setMockMode(enabled: boolean, responses?: MockResponses): void;
  healthCheck(): Promise<HealthCheckResult>;
  getMetrics(): JudgeMetricsReport;
  resetCircuitBreaker(): void;
}

export interface PolicyEngineInterface {
  evaluate(content: string, options?: EvaluateOptions): Promise<PolicyVerdict>;
  getActivePolicy(): Policy;
  setRuntimePolicy(policy: Policy): void;
  clearRuntimePolicy(): void;
  reloadConfig(): Config;
  updateConfig(newConfig: Partial<Config>): Config;
  getConfig(): Omit<Config, 'apiKey'>;
  getAvailableStrategies(): EvaluationStrategy[];
  setMockMode(enabled: boolean, responses?: MockResponses): void;
  healthCheck(): Promise<PolicyEngineHealthCheck>;
  validatePolicy(policy: PolicyInput): ValidationResult;
  addRule(rule: RuleInput): RuleOperationResult;
  updateRule(ruleId: string, updates: Partial<RuleInput>): RuleOperationResult;
  deleteRule(ruleId: string): RuleOperationResult;
}

// ============================================
// Strategy Interface
// ============================================

export interface AggregationStrategyInterface {
  aggregate(ruleResults: RuleResult[], policy: Policy): AggregationResult;
}

// ============================================
// API Request/Response Types
// ============================================

export interface EvaluateRequest {
  content: string;
  policy?: Policy;
}

export interface ConfigUpdateRequest {
  policy?: PolicyInput;
  judge?: Partial<JudgeConfig>;
  settings?: Partial<EngineSettings>;
}

export interface ValidateRequest {
  policy: PolicyInput;
}

export interface ApiErrorResponse {
  error: string;
  message: string;
  errors?: string[];
  warnings?: string[];
}

export interface ConfigUpdateResponse {
  success: boolean;
  message: string;
  config: Omit<Config, 'apiKey'>;
}

export interface RuleAddResponse {
  success: boolean;
  message: string;
  rule: Rule;
  config: Omit<Config, 'apiKey'>;
}

export interface RuleUpdateResponse {
  success: boolean;
  message: string;
  rule: Rule;
  config: Omit<Config, 'apiKey'>;
}

export interface RuleDeleteResponse {
  success: boolean;
  message: string;
  config: Omit<Config, 'apiKey'>;
}

// ============================================
// Action Priority Map
// ============================================

export const ACTION_PRIORITY: Record<Action, number> = {
  block: 3,
  redact: 2,
  warn: 1,
  allow: 0
};

// ============================================
// Initialize Return Type
// ============================================

export interface InitializeResult {
  policyEngine: PolicyEngineInterface;
  routes: import('express').Router;
}

