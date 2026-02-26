import { useState } from 'react';
import './EvaluationPanel.css';

const EvaluationPanel = ({ onEvaluate, evaluating }) => {
  const [content, setContent] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    onEvaluate(content, {});
  };

  const clearForm = () => {
    setContent('');
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
    <div className="panel evaluation-panel evaluation-panel-centered">
      <div className="panel-content">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="eval-content">Content to Evaluate</label>
            <textarea
              id="eval-content"
              className="form-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter the content you want to evaluate against the policy rules..."
              rows={10}
              aria-describedby="char-count"
            />
            <div id="char-count" className="char-count">
              {content.length} characters
            </div>
          </div>

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
                  <span className="loader-sm" aria-hidden></span>
                  Evaluating...
                </>
              ) : (
                <>
                  <span aria-hidden>⚡</span>
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
