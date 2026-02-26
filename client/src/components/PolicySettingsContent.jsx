import { useState } from 'react';
import { addRule, updateRule, deleteRule, updateConfig } from '../services/api';
import './PolicyPanel.css';

const DEFAULT_RULE = {
  id: '',
  description: '',
  judge_prompt: '',
  on_fail: 'warn',
  weight: 1.0
};

const ACTION_OPTIONS = ['block', 'redact', 'warn', 'allow'];
const STRATEGY_OPTIONS = [
  { value: 'all', label: 'All rules must pass' },
  { value: 'any', label: 'At least one rule must pass' },
  { value: 'weighted_threshold', label: 'Weighted score threshold' },
];

const PolicySettingsContent = ({ config, onConfigUpdate }) => {
  const [expandedRule, setExpandedRule] = useState(null);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [formData, setFormData] = useState(DEFAULT_RULE);
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [policySaving, setPolicySaving] = useState(false);

  if (!config) {
    return (
      <div className="policy-settings-content">
        <p className="text-muted">Loading policy configuration...</p>
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

  const handleStrategyChange = async (e) => {
    const value = e.target.value;
    setPolicySaving(true);
    try {
      await updateConfig({
        policy: { ...config.policy, evaluation_strategy: value },
      });
      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Failed to update strategy:', err);
    } finally {
      setPolicySaving(false);
    }
  };

  const handleDefaultActionChange = async (e) => {
    const value = e.target.value;
    setPolicySaving(true);
    try {
      await updateConfig({
        policy: { ...config.policy, default_action: value },
      });
      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Failed to update default action:', err);
    } finally {
      setPolicySaving(false);
    }
  };

  const handleThresholdChange = async (e) => {
    const value = parseFloat(e.target.value);
    setPolicySaving(true);
    try {
      await updateConfig({
        policy: { ...config.policy, threshold: value },
      });
      if (onConfigUpdate) onConfigUpdate();
    } catch (err) {
      console.error('Failed to update threshold:', err);
    } finally {
      setPolicySaving(false);
    }
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
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormError(null);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
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
      if (onConfigUpdate) onConfigUpdate();
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
      if (onConfigUpdate) onConfigUpdate();
    } catch (error) {
      console.error('Failed to delete rule:', error);
    }
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setDeleteConfirm(null);
  };

  return (
    <div className="policy-settings-content">
      <div className="policy-overview">
        <div className="policy-name">
          <span className="label">Policy Name</span>
          <span className="value">{policy.name}</span>
          <span className="policy-version">v{policy.version}</span>
        </div>

        <div className="policy-meta-editable">
          <div className="form-group">
            <label className="form-label" htmlFor="settings-strategy">Evaluation Strategy</label>
            <select
              id="settings-strategy"
              className="form-select"
              value={policy.evaluation_strategy}
              onChange={handleStrategyChange}
              disabled={policySaving}
            >
              {STRATEGY_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {policy.evaluation_strategy === 'weighted_threshold' && (
            <div className="form-group">
              <label className="form-label">
                Threshold ({(policy.threshold != null ? policy.threshold : 0.7) * 100}%)
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={policy.threshold != null ? policy.threshold : 0.7}
                onChange={handleThresholdChange}
                disabled={policySaving}
                className="form-range"
              />
            </div>
          )}
          <div className="form-group">
            <label className="form-label" htmlFor="settings-default-action">Default Action</label>
            <select
              id="settings-default-action"
              className="form-select"
              value={policy.default_action}
              onChange={handleDefaultActionChange}
              disabled={policySaving}
            >
              {ACTION_OPTIONS.map(action => (
                <option key={action} value={action}>
                  {action.charAt(0).toUpperCase() + action.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rules-section">
        <div className="section-header">
          <h3 className="section-title">
            <span>Policy Rules</span>
            <span className="rule-count">{policy.rules.length}</span>
          </h3>
          <button
            type="button"
            className="add-rule-btn"
            onClick={handleOpenAddForm}
            title="Add new rule"
          >
            <span className="add-icon">+</span>
            Add Rule
          </button>
        </div>

        <div className="rules-list rules-list-scrollable">
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
                  <div className="rule-actions">
                    <button
                      type="button"
                      className="rule-action-btn edit-btn"
                      onClick={(e) => handleOpenEditForm(rule, e)}
                      title="Edit rule"
                    >
                      ✎
                    </button>
                    {deleteConfirm === rule.id ? (
                      <div className="delete-confirm" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="confirm-btn confirm-yes"
                          onClick={() => handleConfirmDelete(rule.id)}
                          title="Confirm delete"
                        >
                          ✓
                        </button>
                        <button
                          type="button"
                          className="confirm-btn confirm-no"
                          onClick={handleCancelDelete}
                          title="Cancel"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
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
              <button type="button" className="add-first-rule-btn" onClick={handleOpenAddForm}>
                Add your first rule
              </button>
            </div>
          )}
        </div>
      </div>

      {showRuleForm && (
        <div className="rule-form-overlay" onClick={handleCloseForm}>
          <div className="rule-form-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingRule ? 'Edit Rule' : 'Add New Rule'}</h3>
              <button type="button" className="modal-close" onClick={handleCloseForm}>✕</button>
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
                {editingRule && <span className="field-hint">Rule ID cannot be changed</span>}
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
                <button type="button" className="btn btn-secondary" onClick={handleCloseForm}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
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

export default PolicySettingsContent;
