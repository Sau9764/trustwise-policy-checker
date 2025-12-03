/**
 * HistoryService - Manages evaluation history storage and retrieval
 * 
 * Provides CRUD operations for evaluation history records
 * Supports reproducible evaluations by storing policy snapshots
 */

import { v4 as uuidv4 } from 'uuid';
import { EvaluationHistory, IEvaluationHistory } from '../models/EvaluationHistory';
import { isDatabaseConnected } from '../config/database';
import type { 
  Logger, 
  Policy, 
  PolicyVerdict,
  FinalVerdict 
} from '../types';

// ============================================
// Types
// ============================================

export interface CreateHistoryInput {
  content: string;
  policy: Policy;
  result: PolicyVerdict;
  tags?: string[];
  notes?: string;
}

export interface HistoryListOptions {
  page?: number;
  limit?: number;
  policyName?: string;
  verdict?: FinalVerdict;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  search?: string;
}

export interface HistoryListResult {
  items: IEvaluationHistory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface HistoryServiceOptions {
  logger?: Logger;
}

// ============================================
// Service Class
// ============================================

export class HistoryService {
  private logger: Logger;

  constructor(options: HistoryServiceOptions = {}) {
    this.logger = options.logger || console;
  }

  /**
   * Create a new evaluation history record
   */
  async create(input: CreateHistoryInput): Promise<IEvaluationHistory> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const evaluationId = uuidv4();
    
    this.logger.info('[HistoryService] Creating evaluation history', {
      evaluationId,
      policyName: input.policy.name,
      verdict: input.result.final_verdict,
    });

    const historyRecord = new EvaluationHistory({
      evaluationId,
      content: input.content,
      policySnapshot: {
        name: input.policy.name,
        version: input.policy.version,
        default_action: input.policy.default_action,
        rules: input.policy.rules.map(rule => ({
          id: rule.id,
          description: rule.description,
          judge_prompt: rule.judge_prompt,
          on_fail: rule.on_fail,
          weight: rule.weight,
        })),
        evaluation_strategy: input.policy.evaluation_strategy,
        threshold: input.policy.threshold,
      },
      result: {
        final_verdict: input.result.final_verdict,
        passed: input.result.passed,
        rule_results: input.result.rule_results.map(r => ({
          rule_id: r.rule_id,
          verdict: r.verdict,
          confidence: r.confidence,
          reasoning: r.reasoning,
          action: r.action,
          weight: r.weight,
          latency_ms: r.latency_ms,
        })),
        summary: input.result.summary,
        error: input.result.error,
        total_latency_ms: input.result.total_latency_ms,
      },
      metadata: {
        evaluatedAt: new Date(input.result.evaluated_at),
        tags: input.tags || [],
        notes: input.notes,
        environment: process.env['NODE_ENV'] || 'development',
      },
    });

    await historyRecord.save();

    this.logger.info('[HistoryService] Evaluation history created', {
      evaluationId,
      id: historyRecord._id,
    });

    return historyRecord;
  }

  /**
   * Get evaluation history by ID
   */
  async getById(evaluationId: string): Promise<IEvaluationHistory | null> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Fetching evaluation by ID', { evaluationId });
    
    return EvaluationHistory.findOne({ evaluationId });
  }

  /**
   * Get evaluation history by MongoDB _id
   */
  async getByMongoId(id: string): Promise<IEvaluationHistory | null> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Fetching evaluation by MongoDB ID', { id });
    
    return EvaluationHistory.findById(id);
  }

  /**
   * List evaluation history with pagination and filters
   */
  async list(options: HistoryListOptions = {}): Promise<HistoryListResult> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const {
      page = 1,
      limit = 20,
      policyName,
      verdict,
      startDate,
      endDate,
      tags,
      search,
    } = options;

    this.logger.info('[HistoryService] Listing evaluation history', {
      page,
      limit,
      filters: { policyName, verdict, startDate, endDate, tags, search },
    });

    // Build query
    const query: Record<string, unknown> = {};

    if (policyName) {
      query['policySnapshot.name'] = policyName;
    }

    if (verdict) {
      query['result.final_verdict'] = verdict;
    }

    if (startDate || endDate) {
      query['metadata.evaluatedAt'] = {};
      if (startDate) {
        (query['metadata.evaluatedAt'] as Record<string, Date>)['$gte'] = startDate;
      }
      if (endDate) {
        (query['metadata.evaluatedAt'] as Record<string, Date>)['$lte'] = endDate;
      }
    }

    if (tags && tags.length > 0) {
      query['metadata.tags'] = { $in: tags };
    }

    if (search) {
      query['$or'] = [
        { content: { $regex: search, $options: 'i' } },
        { 'policySnapshot.name': { $regex: search, $options: 'i' } },
        { evaluationId: { $regex: search, $options: 'i' } },
      ];
    }

    // Execute query with pagination
    const skip = (page - 1) * limit;
    
    const [items, total] = await Promise.all([
      EvaluationHistory.find(query)
        .sort({ 'metadata.evaluatedAt': -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EvaluationHistory.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    this.logger.info('[HistoryService] History list retrieved', {
      itemCount: items.length,
      total,
      page,
      totalPages,
    });

    return {
      items: items as IEvaluationHistory[],
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Delete evaluation history by ID
   */
  async delete(evaluationId: string): Promise<boolean> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Deleting evaluation history', { evaluationId });

    const result = await EvaluationHistory.deleteOne({ evaluationId });
    
    const deleted = result.deletedCount > 0;
    
    this.logger.info('[HistoryService] Evaluation history deletion result', {
      evaluationId,
      deleted,
    });

    return deleted;
  }

  /**
   * Delete multiple evaluation histories
   */
  async deleteMany(evaluationIds: string[]): Promise<number> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Deleting multiple evaluation histories', {
      count: evaluationIds.length,
    });

    const result = await EvaluationHistory.deleteMany({
      evaluationId: { $in: evaluationIds },
    });

    this.logger.info('[HistoryService] Batch deletion result', {
      requested: evaluationIds.length,
      deleted: result.deletedCount,
    });

    return result.deletedCount;
  }

  /**
   * Update tags for an evaluation
   */
  async updateTags(evaluationId: string, tags: string[]): Promise<IEvaluationHistory | null> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Updating tags', { evaluationId, tags });

    const result = await EvaluationHistory.findOneAndUpdate(
      { evaluationId },
      { $set: { 'metadata.tags': tags } },
      { new: true }
    );

    return result;
  }

  /**
   * Add notes to an evaluation
   */
  async addNotes(evaluationId: string, notes: string): Promise<IEvaluationHistory | null> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Adding notes', { evaluationId });

    const result = await EvaluationHistory.findOneAndUpdate(
      { evaluationId },
      { $set: { 'metadata.notes': notes } },
      { new: true }
    );

    return result;
  }

  /**
   * Get statistics about evaluation history
   */
  async getStats(): Promise<{
    totalEvaluations: number;
    verdictCounts: Record<FinalVerdict, number>;
    recentEvaluations: number;
    uniquePolicies: number;
  }> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    this.logger.info('[HistoryService] Fetching statistics');

    const [
      totalEvaluations,
      verdictAgg,
      recentCount,
      policyCount,
    ] = await Promise.all([
      EvaluationHistory.countDocuments(),
      EvaluationHistory.aggregate([
        { $group: { _id: '$result.final_verdict', count: { $sum: 1 } } },
      ]),
      EvaluationHistory.countDocuments({
        'metadata.evaluatedAt': {
          $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      }),
      EvaluationHistory.distinct('policySnapshot.name'),
    ]);

    const verdictCounts: Record<FinalVerdict, number> = {
      ALLOW: 0,
      BLOCK: 0,
      WARN: 0,
      REDACT: 0,
      ERROR: 0,
    };

    verdictAgg.forEach((item: { _id: FinalVerdict; count: number }) => {
      verdictCounts[item._id] = item.count;
    });

    return {
      totalEvaluations,
      verdictCounts,
      recentEvaluations: recentCount,
      uniquePolicies: policyCount.length,
    };
  }

  /**
   * Get the policy from an evaluation for re-running
   */
  async getPolicyForRerun(evaluationId: string): Promise<{ policy: Policy; content: string } | null> {
    if (!isDatabaseConnected()) {
      throw new Error('Database not connected');
    }

    const evaluation = await this.getById(evaluationId);
    
    if (!evaluation) {
      return null;
    }

    const policy: Policy = {
      name: evaluation.policySnapshot.name,
      version: evaluation.policySnapshot.version,
      default_action: evaluation.policySnapshot.default_action,
      rules: evaluation.policySnapshot.rules.map(r => ({
        id: r.id,
        description: r.description,
        judge_prompt: r.judge_prompt,
        on_fail: r.on_fail,
        weight: r.weight,
      })),
      evaluation_strategy: evaluation.policySnapshot.evaluation_strategy,
      threshold: evaluation.policySnapshot.threshold,
    };

    return {
      policy,
      content: evaluation.content,
    };
  }
}

export default HistoryService;

