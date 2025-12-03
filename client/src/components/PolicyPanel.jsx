import { useState } from 'react';
import { addRule, updateRule, deleteRule } from '../services/api';
import './PolicyPanel.css';

const DEFAULT_RULE = {
  id: '',
  description: '',
  judge_prompt: '',
  on_fail: 'warn',
  weight: 1.0
};

const ACTION_OPTIONS = ['block', 'redact', 'warn', 'allow'];

const PolicyPanel = ({ config, onConfigUpdate }) => {
  const [expandedRule, setExpandedRule] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_RULE);
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
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

  const { policy } = config;

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

  const handleOpenAddForm = () => {
    setEditingRule(null);
    setFormData(DEFAULT_RULE);
    setFormError(null);
    setShowRuleForm(true);
  };

  const handleOpenEditForm = (rule, e) => {
    e.stopPropagation();
    setEditingRule(rule.id);
    setFormData({
      id: rule.id,
      description: rule.description || '',
      judge_prompt: rule.judge_prompt,
      on_fail: rule.on_fail,
      weight: rule.weight
    });
    setFormError(null);
    setShowRuleForm(true);
  };

  const handleCloseForm = () => {
    setShowRuleForm(false);
    setEditingRule(null);
    setFormData(DEFAULT_RULE);
    setFormError(null);
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setFormError(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.id.trim()) {
      setFormError('Rule ID is required');
      return;
    }
    if (!formData.judge_prompt.trim()) {
      setFormError('Judge Prompt is required');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const ruleData = {
        id: formData.id.trim(),
        description: formData.description.trim(),
        judge_prompt: formData.judge_prompt.trim(),
        on_fail: formData.on_fail,
        weight: parseFloat(formData.weight)
      };

      if (editingRule) {
        await updateRule(editingRule, ruleData);
      } else {
        await addRule(ruleData);
      }

      handleCloseForm();
      if (onConfigUpdate) {
        onConfigUpdate();
      }
    } catch (error) {
      setFormError(error.message || 'Failed to save rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = (ruleId, e) => {
    e.stopPropagation();
    setDeleteConfirm(ruleId);
  };

  const handleConfirmDelete = async (ruleId) => {
    try {
      await deleteRule(ruleId);
      setDeleteConfirm(null);
      if (onConfigUpdate) {
        onConfigUpdate();
      }
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setDeleteConfirm(null);
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

        {/* Rules Section */}
        <div className="rules-section">
          <div className="section-header">
            <h3 className="section-title">
              <span>Policy Rules</span>
              <span className="rule-count">{policy.rules.length}</span>
            </h3>
            <button 
              className="add-rule-btn"
              onClick={handleOpenAddForm}
              title="Add new rule"
            >
              <span className="add-icon">+</span>
              Add Rule
            </button>
          </div>
          
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
                    
                    {/* Action Buttons */}
                    <div className="rule-actions">
                      <button 
                        className="rule-action-btn edit-btn"
                        onClick={(e) => handleOpenEditForm(rule, e)}
                        title="Edit rule"
                      >
                        ✎
                      </button>
                      {deleteConfirm === rule.id ? (
                        <div className="delete-confirm" onClick={e => e.stopPropagation()}>
                          <button 
                            className="confirm-btn confirm-yes"
                            onClick={() => handleConfirmDelete(rule.id)}
                            title="Confirm delete"
                          >
                            ✓
                          </button>
                          <button 
                            className="confirm-btn confirm-no"
                            onClick={handleCancelDelete}
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button 
                          className="rule-action-btn delete-btn"
                          onClick={(e) => handleDeleteClick(rule.id, e)}
                          title="Delete rule"
                        >
                          🗑
                        </button>
                      )}
                    </div>
                    
                    <span className="expand-icon">
                      {expandedRule === rule.id ? '−' : '+'}
                    </span>
                  </div>
                </div>
                
                {expandedRule === rule.id && (
                  <div className="rule-details fade-in">
                    <div className="rule-description">
                      <span className="detail-label">Description</span>
                      <p>{rule.description || 'No description provided'}</p>
                    </div>
                    <div className="rule-prompt">
                      <span className="detail-label">Judge Prompt</span>
                      <code className="code-block">{rule.judge_prompt}</code>
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {policy.rules.length === 0 && (
              <div className="empty-rules">
                <span className="empty-icon">📭</span>
                <p>No rules configured</p>
                <button 
                  className="add-first-rule-btn"
                  onClick={handleOpenAddForm}
                >
                  Add your first rule
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Rule Form Modal */}
      {showRuleForm && (
        <div className="rule-form-overlay" onClick={handleCloseForm}>
          <div className="rule-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRule ? 'Edit Rule' : 'Add New Rule'}</h3>
              <button className="modal-close" onClick={handleCloseForm}>✕</button>
            </div>
            
            <form onSubmit={handleSubmitForm} className="rule-form">
              {formError && (
                <div className="form-error">
                  <span className="error-icon">⚠</span>
                  {formError}
                </div>
              )}
              
              <div className="form-group">
                <label htmlFor="rule-id">Rule ID *</label>
                <input
                  id="rule-id"
                  type="text"
                  value={formData.id}
                  onChange={(e) => handleFormChange('id', e.target.value)}
                  placeholder="e.g., no_profanity"
                  disabled={!!editingRule}
                  className={editingRule ? 'disabled' : ''}
                />
                {editingRule && (
                  <span className="field-hint">Rule ID cannot be changed</span>
                )}
              </div>
              
              <div className="form-group">
                <label htmlFor="rule-description">Description</label>
                <input
                  id="rule-description"
                  type="text"
                  value={formData.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Brief description of what this rule checks"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="rule-prompt">Judge Prompt *</label>
                <textarea
                  id="rule-prompt"
                  value={formData.judge_prompt}
                  onChange={(e) => handleFormChange('judge_prompt', e.target.value)}
                  placeholder="The prompt sent to the AI judge to evaluate the content..."
                  rows={4}
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="rule-action">On Fail Action</label>
                  <select
                    id="rule-action"
                    value={formData.on_fail}
                    onChange={(e) => handleFormChange('on_fail', e.target.value)}
                  >
                    {ACTION_OPTIONS.map(action => (
                      <option key={action} value={action}>
                        {action.charAt(0).toUpperCase() + action.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="rule-weight">Weight ({(formData.weight * 100).toFixed(0)}%)</label>
                  <input
                    id="rule-weight"
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formData.weight}
                    onChange={(e) => handleFormChange('weight', parseFloat(e.target.value))}
                  />
                </div>
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={handleCloseForm}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : (editingRule ? 'Update Rule' : 'Add Rule')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PolicyPanel;
