import { useState } from 'react';
import './EvaluationPanel.css';

const EvaluationPanel = ({ config, onEvaluate, evaluating }) => {
  const [content, setContent] = useState('');
  const [useCustomPolicy, setUseCustomPolicy] = useState(false);
  const [customStrategy, setCustomStrategy] = useState('all');
  const [customThreshold, setCustomThreshold] = useState(0.7);
  const [selectedRules, setSelectedRules] = useState([]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!content.trim()) return;

    const options = {
      useCustomPolicy,
    };

    if (useCustomPolicy && config?.policy) {
      const activeRules = selectedRules.length > 0 
        ? config.policy.rules.filter(r => selectedRules.includes(r.id))
        : config.policy.rules;

      options.customPolicy = {
        ...config.policy,
        rules: activeRules,
        evaluation_strategy: customStrategy,
        threshold: customThreshold,
      };
    }

    onEvaluate(content, options);
  };

  const clearForm = () => {
    setContent('');
    setUseCustomPolicy(false);
    setSelectedRules([]);
    setCustomStrategy('all');
    setCustomThreshold(0.7);
  };

  const sampleContents = [
    {
      label: 'Safe Content',
      content: 'Hello! I would like to schedule a meeting to discuss our project timeline and deliverables for Q1.',
    },
    {
      label: 'PII Content',
      content: 'Please send the invoice to John Smith at 123 Main Street, New York, NY 10001. His phone is 555-123-4567 and SSN is 123-45-6789.',
    },
    {
      label: 'Unprofessional',
      content: 'This is absolutely RIDICULOUS!!! I cant believe you idiots messed this up AGAIN. What a complete waste of time. smh',
    },
    {
      label: 'Mixed Issues',
      content: 'Hey, call me at 555-867-5309 ASAP! This project is a total disaster and everyone involved should be fired!!!',
    },
  ];

  return (
    <div className="panel evaluation-panel">
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-title-icon">🔍</span>
          Content Evaluation
        </h2>
      </div>
      
      <div className="panel-content">
        <form onSubmit={handleSubmit}>
          {/* Content Input */}
          <div className="form-group">
            <label className="form-label">Content to Evaluate</label>
            <textarea
              className="form-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the content you want to evaluate against the policy rules..."
              rows={8}
            />
            <div className="char-count">
              {content.length} characters
            </div>
          </div>

          {/* Sample Content Buttons */}
          <div className="sample-buttons">
            <span className="sample-label">Quick Fill:</span>
            {sampleContents.map((sample, index) => (
              <button
                key={index}
                type="button"
                className="sample-btn"
                onClick={() => setContent(sample.content)}
              >
                {sample.label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={clearForm}
            >
              Clear
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!content.trim() || evaluating}
            >
              {evaluating ? (
                <>
                  <span className="loader-sm"></span>
                  Evaluating...
                </>
              ) : (
                <>
                  <span>⚡</span>
                  Evaluate Content
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EvaluationPanel;


