/**
 * EvaluationHistory Model
 * 
 * MongoDB schema for storing evaluation history records
 * Enables reproducible evaluations by storing policy snapshots
 */

import mongoose, { Document, Schema } from 'mongoose';
import type { 
  Policy, 
  PolicyVerdict, 
  RuleResult, 
  AggregationSummary,
  FinalVerdict,
  Verdict,
  Action,
  EvaluationStrategy
} from '../types';

// ============================================
// Document Interfaces
// ============================================

export interface IEvaluationHistory extends Document {
  // Unique evaluation ID
  evaluationId: string;
  
  // The content that was evaluated
  content: string;
  
  // Policy snapshot at time of evaluation
  policySnapshot: {
    name: string;
    version?: string;
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
  
  // Evaluation result
  result: {
    final_verdict: FinalVerdict;
    passed: boolean;
    rule_results: Array<{
      rule_id: string;
      verdict: Verdict;
      confidence: number;
      reasoning: string;
      action: Action;
      weight: number;
      latency_ms: number;
    }>;
    summary?: AggregationSummary;
    error?: string;
    total_latency_ms: number;
  };
  
  // Metadata
  metadata: {
    evaluatedAt: Date;
    tags?: string[];
    notes?: string;
    environment?: string;
  };
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Schema Definition
// ============================================

const RuleSnapshotSchema = new Schema({
  id: { type: String, required: true },
  description: { type: String },
  judge_prompt: { type: String, required: true },
  on_fail: { 
    type: String, 
    enum: ['allow', 'block', 'warn', 'redact'],
    required: true 
  },
  weight: { type: Number, default: 1.0 },
}, { _id: false });

const PolicySnapshotSchema = new Schema({
  name: { type: String, required: true },
  version: { type: String },
  default_action: { 
    type: String, 
    enum: ['allow', 'block', 'warn', 'redact'],
    required: true 
  },
  rules: [RuleSnapshotSchema],
  evaluation_strategy: { 
    type: String, 
    enum: ['all', 'any', 'weighted_threshold'],
    required: true 
  },
  threshold: { type: Number },
}, { _id: false });

const RuleResultSchema = new Schema({
  rule_id: { type: String, required: true },
  verdict: { 
    type: String, 
    enum: ['PASS', 'FAIL', 'UNCERTAIN'],
    required: true 
  },
  confidence: { type: Number, required: true },
  reasoning: { type: String, required: true },
  action: { 
    type: String, 
    enum: ['allow', 'block', 'warn', 'redact'],
    required: true 
  },
  weight: { type: Number, required: true },
  latency_ms: { type: Number, required: true },
}, { _id: false });

const SummarySchema = new Schema({
  total_rules: { type: Number, required: true },
  passed: { type: Number, required: true },
  failed: { type: Number, required: true },
  uncertain: { type: Number, required: true },
  strategy: { 
    type: String, 
    enum: ['all', 'any', 'weighted_threshold'],
    required: true 
  },
  reason: { type: String, required: true },
  score: { type: Number },
  threshold: { type: Number },
}, { _id: false });

const ResultSchema = new Schema({
  final_verdict: { 
    type: String, 
    enum: ['ALLOW', 'BLOCK', 'WARN', 'REDACT', 'ERROR'],
    required: true 
  },
  passed: { type: Boolean, required: true },
  rule_results: [RuleResultSchema],
  summary: SummarySchema,
  error: { type: String },
  total_latency_ms: { type: Number, required: true },
}, { _id: false });

const MetadataSchema = new Schema({
  evaluatedAt: { type: Date, required: true },
  tags: [{ type: String }],
  notes: { type: String },
  environment: { type: String, default: 'development' },
}, { _id: false });

const EvaluationHistorySchema = new Schema<IEvaluationHistory>(
  {
    evaluationId: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
    },
    content: { 
      type: String, 
      required: true,
    },
    policySnapshot: { 
      type: PolicySnapshotSchema, 
      required: true,
    },
    result: { 
      type: ResultSchema, 
      required: true,
    },
    metadata: { 
      type: MetadataSchema, 
      required: true,
    },
  },
  { 
    timestamps: true,
    collection: 'evaluation_history',
  }
);

// ============================================
// Indexes
// ============================================

// Index for searching by policy name and version
EvaluationHistorySchema.index({ 'policySnapshot.name': 1, 'policySnapshot.version': 1 });

// Index for searching by verdict
EvaluationHistorySchema.index({ 'result.final_verdict': 1 });

// Index for searching by date
EvaluationHistorySchema.index({ 'metadata.evaluatedAt': -1 });

// Index for searching by tags
EvaluationHistorySchema.index({ 'metadata.tags': 1 });

// Compound index for common queries
EvaluationHistorySchema.index({ 
  'metadata.evaluatedAt': -1, 
  'result.final_verdict': 1 
});

// ============================================
// Static Methods
// ============================================

EvaluationHistorySchema.statics.findByEvaluationId = function(evaluationId: string) {
  return this.findOne({ evaluationId });
};

EvaluationHistorySchema.statics.findByPolicyName = function(policyName: string) {
  return this.find({ 'policySnapshot.name': policyName }).sort({ 'metadata.evaluatedAt': -1 });
};

EvaluationHistorySchema.statics.findByVerdict = function(verdict: FinalVerdict) {
  return this.find({ 'result.final_verdict': verdict }).sort({ 'metadata.evaluatedAt': -1 });
};

// ============================================
// Model Export
// ============================================

export const EvaluationHistory = mongoose.model<IEvaluationHistory>(
  'EvaluationHistory', 
  EvaluationHistorySchema
);

export default EvaluationHistory;

