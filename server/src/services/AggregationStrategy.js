/**
 * AggregationStrategy - Evaluation strategy implementations for policy verdicts
 * 
 * Implements three strategies:
 * - all: All rules must pass
 * - any: At least one rule must pass
 * - weighted_threshold: Weighted sum of passed rules must exceed threshold
 */

/**
 * Map of actions to final verdict priorities (higher = more severe)
 */
const ACTION_PRIORITY = {
  block: 3,
  redact: 2,
  warn: 1,
  allow: 0
};

/**
 * Base aggregation strategy class
 */
class BaseStrategy {
  constructor(logger) {
    this.logger = logger || console;
  }

  /**
   * Aggregate rule results into final verdict
   * @param {Array} ruleResults - Array of rule evaluation results
   * @param {Object} policy - Policy configuration
   * @returns {Object} Aggregated verdict
   */
  aggregate(ruleResults, policy) {
    throw new Error('aggregate() must be implemented by subclass');
  }

  /**
   * Determine final action based on rule results
   * @protected
   */
  determineFinalAction(ruleResults, defaultAction) {
    let highestPriority = ACTION_PRIORITY[defaultAction] || 0;
    let finalAction = defaultAction;

    for (const result of ruleResults) {
      if (result.verdict === 'FAIL' && result.action) {
        const priority = ACTION_PRIORITY[result.action] || 0;
        if (priority > highestPriority) {
          highestPriority = priority;
          finalAction = result.action;
        }
      }
    }

    return finalAction.toUpperCase();
  }
}

/**
 * ALL Strategy - All rules must pass
 */
class AllStrategy extends BaseStrategy {
  aggregate(ruleResults, policy) {
    const failedRules = ruleResults.filter(r => r.verdict === 'FAIL');
    const uncertainRules = ruleResults.filter(r => r.verdict === 'UNCERTAIN');
    const passedRules = ruleResults.filter(r => r.verdict === 'PASS');

    this.logger.info('[AllStrategy] Aggregating results', {
      total: ruleResults.length,
      passed: passedRules.length,
      failed: failedRules.length,
      uncertain: uncertainRules.length
    });

    // If any rule fails, the overall verdict is the action of the most severe failure
    if (failedRules.length > 0) {
      const finalAction = this.determineFinalAction(failedRules, policy.default_action);
      
      return {
        final_verdict: finalAction,
        passed: false,
        summary: {
          total_rules: ruleResults.length,
          passed: passedRules.length,
          failed: failedRules.length,
          uncertain: uncertainRules.length,
          strategy: 'all',
          reason: `${failedRules.length} rule(s) failed - all rules must pass`
        }
      };
    }

    // If any rule is uncertain (and none failed), consider it a pass with warning
    if (uncertainRules.length > 0) {
      return {
        final_verdict: 'WARN',
        passed: true,
        summary: {
          total_rules: ruleResults.length,
          passed: passedRules.length,
          failed: failedRules.length,
          uncertain: uncertainRules.length,
          strategy: 'all',
          reason: `${uncertainRules.length} rule(s) uncertain - manual review recommended`
        }
      };
    }

    // All rules passed
    return {
      final_verdict: 'ALLOW',
      passed: true,
      summary: {
        total_rules: ruleResults.length,
        passed: passedRules.length,
        failed: failedRules.length,
        uncertain: uncertainRules.length,
        strategy: 'all',
        reason: 'All rules passed'
      }
    };
  }
}

/**
 * ANY Strategy - At least one rule must pass
 */
class AnyStrategy extends BaseStrategy {
  aggregate(ruleResults, policy) {
    const passedRules = ruleResults.filter(r => r.verdict === 'PASS');
    const failedRules = ruleResults.filter(r => r.verdict === 'FAIL');
    const uncertainRules = ruleResults.filter(r => r.verdict === 'UNCERTAIN');

    this.logger.info('[AnyStrategy] Aggregating results', {
      total: ruleResults.length,
      passed: passedRules.length,
      failed: failedRules.length,
      uncertain: uncertainRules.length
    });

    // If at least one rule passes, allow
    if (passedRules.length > 0) {
      return {
        final_verdict: 'ALLOW',
        passed: true,
        summary: {
          total_rules: ruleResults.length,
          passed: passedRules.length,
          failed: failedRules.length,
          uncertain: uncertainRules.length,
          strategy: 'any',
          reason: `${passedRules.length} rule(s) passed - only one required`
        }
      };
    }

    // If no rules passed but some are uncertain, consider it uncertain
    if (uncertainRules.length > 0) {
      return {
        final_verdict: 'WARN',
        passed: false,
        summary: {
          total_rules: ruleResults.length,
          passed: passedRules.length,
          failed: failedRules.length,
          uncertain: uncertainRules.length,
          strategy: 'any',
          reason: 'No rules passed, some uncertain - manual review required'
        }
      };
    }

    // All rules failed
    const finalAction = this.determineFinalAction(failedRules, policy.default_action);
    
    return {
      final_verdict: finalAction,
      passed: false,
      summary: {
        total_rules: ruleResults.length,
        passed: passedRules.length,
        failed: failedRules.length,
        uncertain: uncertainRules.length,
        strategy: 'any',
        reason: 'All rules failed - at least one must pass'
      }
    };
  }
}

/**
 * WEIGHTED_THRESHOLD Strategy - Weighted sum of passed rules must exceed threshold
 */
class WeightedThresholdStrategy extends BaseStrategy {
  aggregate(ruleResults, policy) {
    const threshold = policy.threshold || 0.7;
    
    let totalWeight = 0;
    let passedWeight = 0;
    const passedRules = [];
    const failedRules = [];
    const uncertainRules = [];

    for (const result of ruleResults) {
      const weight = result.weight || 1.0;
      totalWeight += weight;

      if (result.verdict === 'PASS') {
        passedWeight += weight;
        passedRules.push(result);
      } else if (result.verdict === 'FAIL') {
        failedRules.push(result);
      } else {
        // UNCERTAIN counts as partial pass (50% weight)
        passedWeight += weight * 0.5;
        uncertainRules.push(result);
      }
    }

    const score = totalWeight > 0 ? passedWeight / totalWeight : 0;
    const passed = score >= threshold;

    this.logger.info('[WeightedThresholdStrategy] Aggregating results', {
      totalWeight,
      passedWeight,
      score: score.toFixed(3),
      threshold,
      passed
    });

    if (passed) {
      return {
        final_verdict: 'ALLOW',
        passed: true,
        summary: {
          total_rules: ruleResults.length,
          passed: passedRules.length,
          failed: failedRules.length,
          uncertain: uncertainRules.length,
          strategy: 'weighted_threshold',
          score: parseFloat(score.toFixed(3)),
          threshold,
          reason: `Weighted score ${(score * 100).toFixed(1)}% >= threshold ${(threshold * 100).toFixed(1)}%`
        }
      };
    }

    // Failed to meet threshold
    const finalAction = failedRules.length > 0
      ? this.determineFinalAction(failedRules, policy.default_action)
      : 'BLOCK';

    return {
      final_verdict: finalAction,
      passed: false,
      summary: {
        total_rules: ruleResults.length,
        passed: passedRules.length,
        failed: failedRules.length,
        uncertain: uncertainRules.length,
        strategy: 'weighted_threshold',
        score: parseFloat(score.toFixed(3)),
        threshold,
        reason: `Weighted score ${(score * 100).toFixed(1)}% < threshold ${(threshold * 100).toFixed(1)}%`
      }
    };
  }
}

/**
 * Strategy factory - returns appropriate strategy instance
 * @param {string} strategyName - Name of strategy ('all', 'any', 'weighted_threshold')
 * @param {Object} logger - Logger instance
 * @returns {BaseStrategy} Strategy instance
 */
const createStrategy = (strategyName, logger) => {
  const strategies = {
    all: AllStrategy,
    any: AnyStrategy,
    weighted_threshold: WeightedThresholdStrategy
  };

  const StrategyClass = strategies[strategyName];
  
  if (!StrategyClass) {
    throw new Error(`Unknown evaluation strategy: ${strategyName}. Valid options: all, any, weighted_threshold`);
  }

  return new StrategyClass(logger);
};

/**
 * Get list of available strategies
 * @returns {Array<string>} Available strategy names
 */
const getAvailableStrategies = () => {
  return ['all', 'any', 'weighted_threshold'];
};

module.exports = {
  BaseStrategy,
  AllStrategy,
  AnyStrategy,
  WeightedThresholdStrategy,
  createStrategy,
  getAvailableStrategies,
  ACTION_PRIORITY
};

