import { useState } from 'react';
import './PolicyPanel.css';

const PolicyPanel = ({ config, onConfigUpdate }) => {
  const [expandedRule, setExpandedRule] = useState(null);
  
  if (!config) {
    return (
      <div className="panel policy-panel">
        <div className="panel-header">
          <h2 className="panel-title">
            <span className="panel-title-icon">📋</span>
            Policy Configuration
          </h2>
        </div>
        <div className="panel-content">
          <p className="text-muted">Loading policy configuration...</p>
        </div>
      </div>
    );
  }

  const { policy, judge, settings } = config;

  const getActionColor = (action) => {
    const colors = {
      block: 'var(--accent-red)',
      redact: 'var(--accent-orange)',
      warn: 'var(--accent-yellow)',
      allow: 'var(--accent-green)',
    };
    return colors[action] || 'var(--text-muted)';
  };

  const getStrategyDescription = (strategy) => {
    const descriptions = {
      all: 'All rules must pass',
      any: 'At least one rule must pass',
      weighted_threshold: `Weighted score ≥ ${(policy.threshold * 100).toFixed(0)}%`,
    };
    return descriptions[strategy] || strategy;
  };

  return (
    <div className="panel policy-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-title-icon">📋</span>
          Policy Configuration
        </h2>
        <span className="policy-version">v{policy.version}</span>
      </div>
      
      <div className="panel-content">
        {/* Policy Overview */}
        <div className="policy-overview">
          <div className="policy-name">
            <span className="label">Policy Name</span>
            <span className="value">{policy.name}</span>
          </div>
          
          <div className="policy-meta">
            <div className="meta-item">
              <span className="meta-label">Strategy</span>
              <span className="meta-value strategy-badge">
                {policy.evaluation_strategy}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Default Action</span>
              <span 
                className="meta-value action-badge"
                style={{ color: getActionColor(policy.default_action) }}
              >
                {policy.default_action.toUpperCase()}
              </span>
            </div>
            <div className="meta-item">
              <span className="meta-label">Rules</span>
              <span className="meta-value">{policy.rules.length}</span>
            </div>
          </div>
          
          <div className="strategy-description">
            {getStrategyDescription(policy.evaluation_strategy)}
          </div>
        </div>

        {/* Rules List */}
        <div className="rules-section">
          <h3 className="section-title">
            <span>Policy Rules</span>
            <span className="rule-count">{policy.rules.length}</span>
          </h3>
          
          <div className="rules-list">
            {policy.rules.map((rule, index) => (
              <div 
                key={rule.id} 
                className={`rule-card ${expandedRule === rule.id ? 'expanded' : ''}`}
                onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              >
                <div className="rule-header">
                  <div className="rule-info">
                    <span className="rule-index">{index + 1}</span>
                    <span className="rule-id">{rule.id}</span>
                  </div>
                  <div className="rule-badges">
                    <span 
                      className="rule-action"
                      style={{ 
                        background: `${getActionColor(rule.on_fail)}20`,
                        color: getActionColor(rule.on_fail)
                      }}
                    >
                      {rule.on_fail}
                    </span>
                    <span className="rule-weight">
                      {(rule.weight * 100).toFixed(0)}%
                    </span>
                    <span className="expand-icon">
                      {expandedRule === rule.id ? '−' : '+'}
                    </span>
                  </div>
                </div>
                
                {expandedRule === rule.id && (
                  <div className="rule-details fade-in">
                    <div className="rule-description">
                      <span className="detail-label">Description</span>
                      <p>{rule.description}</p>
                    </div>
                    <div className="rule-prompt">
                      <span className="detail-label">Judge Prompt</span>
                      <code className="code-block">{rule.judge_prompt}</code>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Judge Configuration */}
        <div className="judge-section">
          <h3 className="section-title">Judge Configuration</h3>
          <div className="judge-config">
            <div className="config-item">
              <span className="config-label">Model</span>
              <span className="config-value model-tag">{judge.model}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Temperature</span>
              <span className="config-value">{judge.temperature}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Max Tokens</span>
              <span className="config-value">{judge.maxTokens}</span>
            </div>
            <div className="config-item">
              <span className="config-label">Timeout</span>
              <span className="config-value">{(judge.timeout / 1000).toFixed(0)}s</span>
            </div>
            <div className="config-item">
              <span className="config-label">Max Retries</span>
              <span className="config-value">{judge.maxRetries}</span>
            </div>
          </div>
        </div>

        {/* Settings */}
        <div className="settings-section">
          <h3 className="section-title">Settings</h3>
          <div className="settings-list">
            <div className={`setting-item ${settings.parallelEvaluation ? 'enabled' : ''}`}>
              <span className="setting-indicator"></span>
              <span className="setting-label">Parallel Evaluation</span>
            </div>
            <div className={`setting-item ${settings.debugLog ? 'enabled' : ''}`}>
              <span className="setting-indicator"></span>
              <span className="setting-label">Debug Logging</span>
            </div>
            <div className={`setting-item ${settings.cacheResults ? 'enabled' : ''}`}>
              <span className="setting-indicator"></span>
              <span className="setting-label">Cache Results</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PolicyPanel;

