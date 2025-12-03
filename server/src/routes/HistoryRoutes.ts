/**
 * HistoryRoutes - REST API endpoints for Evaluation History
 * 
 * Endpoints:
 * - GET /api/history - List all evaluations with pagination
 * - GET /api/history/stats - Get evaluation statistics
 * - GET /api/history/:evaluationId - Get specific evaluation
 * - POST /api/history/:evaluationId/rerun - Re-run an evaluation
 * - DELETE /api/history/:evaluationId - Delete an evaluation
 * - DELETE /api/history/batch - Delete multiple evaluations
 * - PATCH /api/history/:evaluationId/tags - Update evaluation tags
 * - PATCH /api/history/:evaluationId/notes - Update evaluation notes
 */

import { Router, Request, Response } from 'express';
import { HistoryService, HistoryListOptions } from '../services/HistoryService';
import type { Logger, PolicyEngineInterface, FinalVerdict } from '../types';

export interface HistoryRoutesOptions {
  logger?: Logger;
}

/**
 * Create history routes
 */
export const createHistoryRoutes = (
  historyService: HistoryService,
  policyEngine: PolicyEngineInterface,
  options: HistoryRoutesOptions = {}
): Router => {
  const router = Router();
  const logger: Logger = options.logger || console;

  /**
   * GET /api/history
   * List all evaluations with pagination and filters
   */
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        page = '1',
        limit = '20',
        policyName,
        verdict,
        startDate,
        endDate,
        tags,
        search,
      } = req.query;

      const listOptions: HistoryListOptions = {
        page: parseInt(page as string, 10),
        limit: Math.min(parseInt(limit as string, 10), 100), // Cap at 100
      };

      if (policyName) {
        listOptions.policyName = policyName as string;
      }

      if (verdict) {
        listOptions.verdict = verdict as FinalVerdict;
      }

      if (startDate) {
        listOptions.startDate = new Date(startDate as string);
      }

      if (endDate) {
        listOptions.endDate = new Date(endDate as string);
      }

      if (tags) {
        listOptions.tags = (tags as string).split(',');
      }

      if (search) {
        listOptions.search = search as string;
      }

      logger.info('[HistoryRoutes] List history request', { ...listOptions });

      const result = await historyService.list(listOptions);

      res.json(result);

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] List history error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * GET /api/history/stats
   * Get evaluation statistics
   */
  router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
    try {
      logger.info('[HistoryRoutes] Get stats request');

      const stats = await historyService.getStats();

      res.json(stats);

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Get stats error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * GET /api/history/:evaluationId
   * Get a specific evaluation by ID
   */
  router.get('/:evaluationId', async (req: Request<{ evaluationId: string }>, res: Response): Promise<void> => {
    try {
      const { evaluationId } = req.params;

      logger.info('[HistoryRoutes] Get evaluation request', { evaluationId });

      const evaluation = await historyService.getById(evaluationId);

      if (!evaluation) {
        res.status(404).json({
          error: 'Not Found',
          message: `Evaluation with ID '${evaluationId}' not found`,
        });
        return;
      }

      res.json(evaluation);

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Get evaluation error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * POST /api/history/:evaluationId/rerun
   * Re-run an evaluation using the stored policy and content
   */
  router.post('/:evaluationId/rerun', async (req: Request<{ evaluationId: string }>, res: Response): Promise<void> => {
    try {
      const { evaluationId } = req.params;
      const { saveToHistory = true } = req.body || {};

      logger.info('[HistoryRoutes] Re-run evaluation request', { 
        evaluationId, 
        saveToHistory 
      });

      // Get the original evaluation data
      const rerunData = await historyService.getPolicyForRerun(evaluationId);

      if (!rerunData) {
        res.status(404).json({
          error: 'Not Found',
          message: `Evaluation with ID '${evaluationId}' not found`,
        });
        return;
      }

      const { policy, content } = rerunData;

      // Re-run the evaluation with the original policy
      const verdict = await policyEngine.evaluate(content, { policy });

      // Optionally save to history
      let newEvaluationId: string | null = null;
      if (saveToHistory) {
        const historyRecord = await historyService.create({
          content,
          policy,
          result: verdict,
          tags: ['rerun', `rerun-of:${evaluationId}`],
          notes: `Re-run of evaluation ${evaluationId}`,
        });
        newEvaluationId = historyRecord.evaluationId;
      }

      res.json({
        success: true,
        originalEvaluationId: evaluationId,
        newEvaluationId,
        result: verdict,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Re-run evaluation error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * DELETE /api/history/:evaluationId
   * Delete an evaluation by ID
   */
  router.delete('/:evaluationId', async (req: Request<{ evaluationId: string }>, res: Response): Promise<void> => {
    try {
      const { evaluationId } = req.params;

      logger.info('[HistoryRoutes] Delete evaluation request', { evaluationId });

      const deleted = await historyService.delete(evaluationId);

      if (!deleted) {
        res.status(404).json({
          error: 'Not Found',
          message: `Evaluation with ID '${evaluationId}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        message: `Evaluation '${evaluationId}' deleted successfully`,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Delete evaluation error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * DELETE /api/history/batch
   * Delete multiple evaluations
   */
  router.delete('/batch', async (req: Request, res: Response): Promise<void> => {
    try {
      const { evaluationIds } = req.body;

      if (!evaluationIds || !Array.isArray(evaluationIds) || evaluationIds.length === 0) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'evaluationIds must be a non-empty array',
        });
        return;
      }

      logger.info('[HistoryRoutes] Batch delete request', { count: evaluationIds.length });

      const deletedCount = await historyService.deleteMany(evaluationIds);

      res.json({
        success: true,
        message: `${deletedCount} evaluation(s) deleted`,
        deletedCount,
        requestedCount: evaluationIds.length,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Batch delete error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * PATCH /api/history/:evaluationId/tags
   * Update tags for an evaluation
   */
  router.patch('/:evaluationId/tags', async (req: Request<{ evaluationId: string }>, res: Response): Promise<void> => {
    try {
      const { evaluationId } = req.params;
      const { tags } = req.body;

      if (!tags || !Array.isArray(tags)) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'tags must be an array',
        });
        return;
      }

      logger.info('[HistoryRoutes] Update tags request', { evaluationId, tags });

      const updated = await historyService.updateTags(evaluationId, tags);

      if (!updated) {
        res.status(404).json({
          error: 'Not Found',
          message: `Evaluation with ID '${evaluationId}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        evaluation: updated,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Update tags error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  /**
   * PATCH /api/history/:evaluationId/notes
   * Add or update notes for an evaluation
   */
  router.patch('/:evaluationId/notes', async (req: Request<{ evaluationId: string }>, res: Response): Promise<void> => {
    try {
      const { evaluationId } = req.params;
      const { notes } = req.body;

      if (typeof notes !== 'string') {
        res.status(400).json({
          error: 'Bad Request',
          message: 'notes must be a string',
        });
        return;
      }

      logger.info('[HistoryRoutes] Update notes request', { evaluationId });

      const updated = await historyService.addNotes(evaluationId, notes);

      if (!updated) {
        res.status(404).json({
          error: 'Not Found',
          message: `Evaluation with ID '${evaluationId}' not found`,
        });
        return;
      }

      res.json({
        success: true,
        evaluation: updated,
      });

    } catch (error) {
      const err = error as Error;
      logger.error('[HistoryRoutes] Update notes error', { error: err.message });

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
      });
    }
  });

  return router;
};

export default createHistoryRoutes;

