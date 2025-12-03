/**
 * PolicyEngine Unit Tests
 * 
 * Test Cases:
 * 1. A policy where all rules pass → ALLOW
 * 2. A policy where one critical rule fails → BLOCK
 * 3. A weighted policy that passes despite one failure
 * 4. Handling of an LLM timeout on one rule
 * 5. A rule that returns UNCERTAIN verdict
 * 
 * Run with: npm test
 */

const PolicyEngine = require('../services/PolicyEngine');

// Test utilities
let testsPassed = 0;
let testsFailed = 0;

const assert = (condition, message) => {
  if (condition) {
    testsPassed++;
    console.log(`✓ PASS: ${message}`);
  } else {
    testsFailed++;
    console.error(`✗ FAIL: ${message}`);
  }
};

// Mock logger to suppress output during tests
const mockLogger = {
  info: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
  log: () => {}
};

// Test policy configuration
const testPolicy = {
  name: 'test_content_policy',
  version: '1.0',
  default_action: 'block',
  rules: [
    {
      id: 'rule_1',
      description: 'Test rule 1',
      judge_prompt: 'Is this content safe?',
      on_fail: 'block',
      weight: 1.0
    },
    {
      id: 'rule_2',
      description: 'Test rule 2',
      judge_prompt: 'Is this content professional?',
      on_fail: 'warn',
      weight: 0.5
    },
    {
      id: 'rule_3',
      description: 'Test rule 3',
      judge_prompt: 'Is this content appropriate?',
      on_fail: 'redact',
      weight: 0.8
    }
  ],
  evaluation_strategy: 'all',
  threshold: 0.7
};

/**
 * Test 1: All rules pass → ALLOW
 */
async function testAllRulesPass() {
  console.log('\n========================================');
  console.log('Test 1: All rules pass → ALLOW');
  console.log('========================================');

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'PASS', confidence: 0.95, reasoning: 'Content is safe' },
      rule_2: { verdict: 'PASS', confidence: 0.90, reasoning: 'Content is professional' },
      rule_3: { verdict: 'PASS', confidence: 0.85, reasoning: 'Content is appropriate' }
    }
  });

  const content = 'This is a professional and safe message.';
  const verdict = await engine.evaluate(content, { policy: testPolicy });

  assert(verdict.final_verdict === 'ALLOW', 'Final verdict should be ALLOW');
  assert(verdict.passed === true, 'Passed should be true');
  assert(verdict.rule_results.length === 3, 'Should have 3 rule results');
  assert(verdict.rule_results.every(r => r.verdict === 'PASS'), 'All rules should pass');
  assert(verdict.summary.strategy === 'all', 'Strategy should be "all"');
  assert(verdict.total_latency_ms >= 0, 'Should have latency recorded');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 2: One critical rule fails → BLOCK
 */
async function testCriticalRuleFails() {
  console.log('\n========================================');
  console.log('Test 2: One critical rule fails → BLOCK');
  console.log('========================================');

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'FAIL', confidence: 0.95, reasoning: 'Hate speech detected' },
      rule_2: { verdict: 'PASS', confidence: 0.90, reasoning: 'Content is professional' },
      rule_3: { verdict: 'PASS', confidence: 0.85, reasoning: 'Content is appropriate' }
    }
  });

  const content = 'This message contains inappropriate content.';
  const verdict = await engine.evaluate(content, { policy: testPolicy });

  assert(verdict.final_verdict === 'BLOCK', 'Final verdict should be BLOCK');
  assert(verdict.passed === false, 'Passed should be false');
  assert(verdict.rule_results.filter(r => r.verdict === 'FAIL').length === 1, 'Should have 1 failed rule');
  assert(verdict.rule_results.find(r => r.rule_id === 'rule_1').verdict === 'FAIL', 'Rule 1 should fail');
  assert(verdict.summary.failed === 1, 'Summary should show 1 failed');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 3: Weighted policy passes despite one failure
 */
async function testWeightedPolicyPasses() {
  console.log('\n========================================');
  console.log('Test 3: Weighted policy passes despite one failure');
  console.log('========================================');

  const weightedPolicy = {
    ...testPolicy,
    evaluation_strategy: 'weighted_threshold',
    threshold: 0.6
  };

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'PASS', confidence: 0.95, reasoning: 'Content is safe' },
      rule_2: { verdict: 'FAIL', confidence: 0.80, reasoning: 'Slightly unprofessional' },
      rule_3: { verdict: 'PASS', confidence: 0.85, reasoning: 'Content is appropriate' }
    }
  });

  const content = 'This is mostly professional content with minor issues.';
  const verdict = await engine.evaluate(content, { policy: weightedPolicy });

  assert(verdict.final_verdict === 'ALLOW', 'Final verdict should be ALLOW');
  assert(verdict.passed === true, 'Passed should be true');
  assert(verdict.summary.strategy === 'weighted_threshold', 'Strategy should be weighted_threshold');
  assert(verdict.summary.score >= 0.6, 'Score should be >= threshold');
  assert(verdict.rule_results.filter(r => r.verdict === 'FAIL').length === 1, 'Should have 1 failed rule');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 4: LLM timeout handling on one rule
 */
async function testLLMTimeout() {
  console.log('\n========================================');
  console.log('Test 4: LLM timeout handling on one rule');
  console.log('========================================');

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'PASS', confidence: 0.95, reasoning: 'Content is safe' },
      rule_2: { timeout: 100 },
      rule_3: { verdict: 'PASS', confidence: 0.85, reasoning: 'Content is appropriate' }
    }
  });

  const content = 'This is test content for timeout handling.';
  const verdict = await engine.evaluate(content, { policy: testPolicy });

  const timeoutRule = verdict.rule_results.find(r => r.rule_id === 'rule_2');
  
  assert(timeoutRule.verdict === 'UNCERTAIN', 'Timed out rule should have UNCERTAIN verdict');
  assert(verdict.final_verdict === 'WARN', 'Final verdict should be WARN (due to UNCERTAIN)');
  assert(verdict.summary.uncertain === 1, 'Summary should show 1 uncertain');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 5: UNCERTAIN verdict handling
 */
async function testUncertainVerdict() {
  console.log('\n========================================');
  console.log('Test 5: UNCERTAIN verdict handling');
  console.log('========================================');

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'PASS', confidence: 0.95, reasoning: 'Content is safe' },
      rule_2: { verdict: 'UNCERTAIN', confidence: 0.45, reasoning: 'Cannot determine if professional' },
      rule_3: { verdict: 'PASS', confidence: 0.85, reasoning: 'Content is appropriate' }
    }
  });

  const content = 'This is ambiguous content that is hard to evaluate.';
  const verdict = await engine.evaluate(content, { policy: testPolicy });

  assert(verdict.final_verdict === 'WARN', 'Final verdict should be WARN');
  assert(verdict.passed === true, 'Passed should be true (with caution)');
  assert(verdict.summary.uncertain === 1, 'Summary should show 1 uncertain');
  assert(verdict.summary.passed === 2, 'Summary should show 2 passed');

  const uncertainRule = verdict.rule_results.find(r => r.rule_id === 'rule_2');
  assert(uncertainRule.verdict === 'UNCERTAIN', 'Rule 2 should be UNCERTAIN');
  assert(uncertainRule.confidence < 0.5, 'Uncertain rule should have low confidence');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 6: ANY strategy works correctly
 */
async function testAnyStrategy() {
  console.log('\n========================================');
  console.log('Test 6: ANY strategy - one pass is enough');
  console.log('========================================');

  const anyPolicy = {
    ...testPolicy,
    evaluation_strategy: 'any'
  };

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true,
    mockResponses: {
      rule_1: { verdict: 'FAIL', confidence: 0.95, reasoning: 'Failed check' },
      rule_2: { verdict: 'PASS', confidence: 0.90, reasoning: 'Passed check' },
      rule_3: { verdict: 'FAIL', confidence: 0.85, reasoning: 'Failed check' }
    }
  });

  const content = 'Content with mixed results.';
  const verdict = await engine.evaluate(content, { policy: anyPolicy });

  assert(verdict.final_verdict === 'ALLOW', 'Final verdict should be ALLOW (at least one passed)');
  assert(verdict.passed === true, 'Passed should be true');
  assert(verdict.summary.strategy === 'any', 'Strategy should be "any"');
  assert(verdict.summary.passed === 1, 'Should have 1 passed rule');
  assert(verdict.summary.failed === 2, 'Should have 2 failed rules');

  console.log('Verdict:', JSON.stringify(verdict, null, 2));
}

/**
 * Test 7: Policy validation
 */
async function testPolicyValidation() {
  console.log('\n========================================');
  console.log('Test 7: Policy validation');
  console.log('========================================');

  const engine = new PolicyEngine({
    logger: mockLogger,
    mockMode: true
  });

  // Test valid policy
  const validResult = engine.validatePolicy(testPolicy);
  assert(validResult.valid === true, 'Valid policy should pass validation');
  assert(validResult.errors.length === 0, 'Valid policy should have no errors');

  // Test invalid policy (missing name)
  const invalidPolicy1 = { rules: [] };
  const invalidResult1 = engine.validatePolicy(invalidPolicy1);
  assert(invalidResult1.valid === false, 'Policy without name should fail');
  assert(invalidResult1.errors.length > 0, 'Should have validation errors');

  // Test invalid strategy
  const invalidPolicy2 = { 
    name: 'test', 
    rules: [{ id: 'r1', judge_prompt: 'test' }],
    evaluation_strategy: 'invalid_strategy'
  };
  const invalidResult2 = engine.validatePolicy(invalidPolicy2);
  assert(invalidResult2.valid === false, 'Invalid strategy should fail');

  console.log('Validation tests completed');
}

// Run all tests
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║     Trustwise PolicyEngine Unit Tests      ║');
  console.log('╚════════════════════════════════════════════╝');

  try {
    await testAllRulesPass();
    await testCriticalRuleFails();
    await testWeightedPolicyPasses();
    await testLLMTimeout();
    await testUncertainVerdict();
    await testAnyStrategy();
    await testPolicyValidation();

  } catch (error) {
    console.error('\n✗ Test suite error:', error);
    testsFailed++;
  }

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║           Test Results                     ║');
  console.log('╠════════════════════════════════════════════╣');
  console.log(`║   Total Tests: ${(testsPassed + testsFailed).toString().padEnd(28)}║`);
  console.log(`║   Passed: ${testsPassed.toString().padEnd(33)}║`);
  console.log(`║   Failed: ${testsFailed.toString().padEnd(33)}║`);
  console.log('╚════════════════════════════════════════════╝');

  if (testsFailed > 0) {
    console.log('\n✗ Some tests failed!\n');
    process.exit(1);
  } else {
    console.log('\n✓ All tests passed!\n');
    process.exit(0);
  }
}

// Run tests if executed directly
if (require.main === module) {
  runAllTests();
}

module.exports = { runAllTests };


