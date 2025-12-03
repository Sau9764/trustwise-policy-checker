/**
 * PolicyConfig Model
 * 
 * MongoDB schema for storing policy configuration
 * Replaces file-based configuration with database storage
 */

import mongoose, { Document, Schema } from 'mongoose';
import type { 
  Policy, 
  JudgeConfig, 
  EngineSettings,
  Action,
  EvaluationStrategy
} from '../types';

// ============================================
// Document Interface
// ============================================

export interface IPolicyConfig extends Document {
  // Identifier for the config (e.g., 'default', 'production', etc.)
  configId: string;
  
  // Policy configuration
  policy: {
    name: string;
    version: string;
    default_action: Action;
    rules: Array<{
      id: string;
      description?: string;
      judge_prompt: string;
      on_fail: Action;
      weight?: number;
    }>;
    evaluation_strategy: EvaluationStrategy;
    threshold?: number;
  };
  
  // Judge configuration
  judge: {
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
  };
  
  // Engine settings
  settings: {
    parallelEvaluation: boolean;
    debugLog: boolean;
    cacheResults: boolean;
  };
  
  // Metadata
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Schema Definition
// ============================================

const RuleSchema = new Schema({
  id: { type: String, required: true },
  description: { type: String, default: '' },
  judge_prompt: { type: String, required: true },
  on_fail: { 
    type: String, 
    enum: ['allow', 'block', 'warn', 'redact'],
    default: 'warn'
  },
  weight: { type: Number, default: 1.0, min: 0, max: 1 },
}, { _id: false });

const PolicySchema = new Schema({
  name: { type: String, required: true },
  version: { type: String, default: '1.0.0' },
  default_action: { 
    type: String, 
    enum: ['allow', 'block', 'warn', 'redact'],
    default: 'warn'
  },
  rules: [RuleSchema],
  evaluation_strategy: { 
    type: String, 
    enum: ['all', 'any', 'weighted_threshold'],
    default: 'all'
  },
  threshold: { type: Number, min: 0, max: 1 },
}, { _id: false });

const JudgeConfigSchema = new Schema({
  model: { type: String, default: 'gpt-4o-mini' },
  temperature: { type: Number, default: 0.1, min: 0, max: 2 },
  maxTokens: { type: Number, default: 500 },
  timeout: { type: Number, default: 30000 },
  maxRetries: { type: Number, default: 3 },
  retryDelay: { type: Number, default: 1000 },
  maxRetryDelay: { type: Number, default: 10000 },
  backoffMultiplier: { type: Number, default: 2 },
  circuitBreakerThreshold: { type: Number, default: 5 },
  circuitBreakerResetMs: { type: Number, default: 60000 },
}, { _id: false });

const SettingsSchema = new Schema({
  parallelEvaluation: { type: Boolean, default: true },
  debugLog: { type: Boolean, default: false },
  cacheResults: { type: Boolean, default: false },
}, { _id: false });

const PolicyConfigSchema = new Schema<IPolicyConfig>(
  {
    configId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
      default: 'default'
    },
    policy: { 
      type: PolicySchema, 
      required: true 
    },
    judge: { 
      type: JudgeConfigSchema, 
      required: true 
    },
    settings: { 
      type: SettingsSchema, 
      required: true 
    },
    isActive: { 
      type: Boolean, 
      default: true,
      index: true
    },
  },
  { 
    timestamps: true,
    collection: 'policy_configs',
  }
);

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_CONFIG: Omit<IPolicyConfig, keyof Document> = {
  configId: 'default',
  policy: {
    name: 'content_safety_policy',
    version: '1.0.0',
    default_action: 'warn',
    rules: [
      {
        id: 'no_hate_speech',
        description: 'Detect and prevent hate speech, discrimination, or harassment',
        judge_prompt: 'Analyze the following content for hate speech, discrimination, slurs, or harassment targeting any group or individual. Consider both explicit and implicit forms of hateful content. Return PASS if the content is respectful and free of hate speech, FAIL if it contains hateful content.',
        on_fail: 'block',
        weight: 1.0
      },
      {
        id: 'no_pii',
        description: 'Detect personally identifiable information (PII)',
        judge_prompt: 'Scan the content for personally identifiable information (PII) including: full names with context, email addresses, phone numbers, physical addresses, social security numbers, credit card numbers, passport numbers, or any combination that could identify a specific individual. Return PASS if no PII is found, FAIL if PII is detected.',
        on_fail: 'redact',
        weight: 0.9
      },
      {
        id: 'professional_tone',
        description: 'Ensure content maintains a professional tone',
        judge_prompt: 'Evaluate whether this content maintains a professional and appropriate tone for business communication. Consider: excessive use of caps/exclamation marks, informal slang, unprofessional language, or aggressive tone. Return PASS if the tone is professional, FAIL if it is unprofessional.',
        on_fail: 'warn',
        weight: 0.7
      }
    ],
    evaluation_strategy: 'all',
    threshold: 0.7
  },
  judge: {
    model: 'gpt-4o-mini',
    temperature: 0.1,
    maxTokens: 500,
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    maxRetryDelay: 10000,
    backoffMultiplier: 2,
    circuitBreakerThreshold: 5,
    circuitBreakerResetMs: 60000
  },
  settings: {
    parallelEvaluation: true,
    debugLog: false,
    cacheResults: false
  },
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

// ============================================
// Model Export
// ============================================

export const PolicyConfig = mongoose.model<IPolicyConfig>(
  'PolicyConfig', 
  PolicyConfigSchema
);

export default PolicyConfig;

