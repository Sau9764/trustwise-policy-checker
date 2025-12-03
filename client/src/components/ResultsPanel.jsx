import './ResultsPanel.css';

const ResultsPanel = ({ result }) => {
  if (!result) return null;

  // Handle error state
  if (result.error === true) {
    return (
      <div className="results-panel results-error fade-in">
        <div className="results-header">
          <h2 className="results-title">
            <span className="results-icon error">⚠</span>
            Evaluation Error
          </h2>
        </div>
        <div className="results-content">
          <p className="error-message">{result.message}</p>
        </div>
      </div>
    );
  }

  const getVerdictClass = (verdict) => {
    const classes = {
      ALLOW: 'verdict-allow',
      PASS: 'verdict-pass',
      BLOCK: 'verdict-block',
      FAIL: 'verdict-fail',
      WARN: 'verdict-warn',
      REDACT: 'verdict-redact',
      UNCERTAIN: 'verdict-uncertain',
      ERROR: 'verdict-error',
    };
    return classes[verdict] || '';
  };

  const getVerdictIcon = (verdict) => {
    const icons = {
      ALLOW: '✓',
      PASS: '✓',
      BLOCK: '✕',
      FAIL: '✕',
      WARN: '⚠',
      REDACT: '◐',
      UNCERTAIN: '?',
      ERROR: '!',
    };
    return icons[verdict] || '•';
  };

  const formatLatency = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  return (
    <div className="results-panel fade-in">
      <div className="results-header">
        <h2 className="results-title">
          <span className="results-icon">📊</span>
          Evaluation Results
        </h2>
        <div className="results-meta">
          <span className="meta-timestamp">
            {new Date(result.evaluated_at).toLocaleTimeString()}
          </span>
          <span className="meta-latency">
            {formatLatency(result.total_latency_ms)}
          </span>
        </div>
      </div>

      <div className="results-content">
        {/* Final Verdict Card */}
        <div className={`verdict-card ${getVerdictClass(result.final_verdict)}`}>
          <div className="verdict-icon">
            {getVerdictIcon(result.final_verdict)}
          </div>
          <div className="verdict-info">
            <div className="verdict-label">Final Verdict</div>
            <div className="verdict-value">{result.final_verdict}</div>
          </div>
          <div className={`verdict-status ${result.passed ? 'passed' : 'failed'}`}>
            {result.passed ? 'Content Accepted' : 'Content Rejected'}
          </div>
        </div>

        {/* Summary Stats */}
        {result.summary && (
          <div className="summary-section">
            <h3 className="section-title">Evaluation Summary</h3>
            <div className="summary-grid">
              <div className="summary-stat">
                <span className="stat-value">{result.summary.total_rules}</span>
                <span className="stat-label">Total Rules</span>
              </div>
              <div className="summary-stat stat-pass">
                <span className="stat-value">{result.summary.passed}</span>
                <span className="stat-label">Passed</span>
              </div>
              <div className="summary-stat stat-fail">
                <span className="stat-value">{result.summary.failed}</span>
                <span className="stat-label">Failed</span>
              </div>
              <div className="summary-stat stat-uncertain">
                <span className="stat-value">{result.summary.uncertain}</span>
                <span className="stat-label">Uncertain</span>
              </div>
            </div>
            
            <div className="summary-details">
              <div className="detail-row">
                <span className="detail-label">Strategy</span>
                <span className="detail-value">{result.summary.strategy}</span>
              </div>
              {result.summary.score !== undefined && (
                <div className="detail-row">
                  <span className="detail-label">Score</span>
                  <span className="detail-value">
                    {(result.summary.score * 100).toFixed(1)}%
                    <span className="threshold-info">
                      (threshold: {(result.summary.threshold * 100).toFixed(0)}%)
                    </span>
                  </span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Reason</span>
                <span className="detail-value reason">{result.summary.reason}</span>
              </div>
            </div>
          </div>
        )}

        {/* Rule Results */}
        {result.rule_results && result.rule_results.length > 0 && (
          <div className="rules-section">
            <h3 className="section-title">Individual Rule Results</h3>
            <div className="rule-results">
              {result.rule_results.map((rule, index) => (
                <div 
                  key={rule.rule_id} 
                  className={`rule-result ${getVerdictClass(rule.verdict)}`}
                >
                  <div className="rule-result-header">
                    <div className="rule-result-info">
                      <span className="rule-result-index">{index + 1}</span>
                      <span className="rule-result-id">{rule.rule_id}</span>
                    </div>
                    <div className="rule-result-badges">
                      <span className={`badge badge-${rule.verdict.toLowerCase()}`}>
                        {rule.verdict}
                      </span>
                      <span className="confidence-badge">
                        {(rule.confidence * 100).toFixed(0)}%
                      </span>
                      <span className="latency-badge">
                        {formatLatency(rule.latency_ms)}
                      </span>
                    </div>
                  </div>
                  <div className="rule-result-body">
                    <div className="rule-reasoning">
                      <span className="reasoning-label">Reasoning:</span>
                      <span className="reasoning-text">{rule.reasoning}</span>
                    </div>
                    {rule.action && (
                      <div className="rule-action-info">
                        <span className="action-label">On Fail:</span>
                        <span className={`action-value action-${rule.action}`}>
                          {rule.action.toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Policy Info */}
        <div className="policy-info">
          <span className="policy-name">
            Policy: {result.policy_name} v{result.policy_version}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;

