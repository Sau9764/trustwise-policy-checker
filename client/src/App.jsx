import { useState, useEffect } from 'react';
import Header from './components/Header';
import PolicyPanel from './components/PolicyPanel';
import EvaluationPanel from './components/EvaluationPanel';
import ResultsPanel from './components/ResultsPanel';
import { fetchConfig, evaluateContent } from './services/api';
import './App.css';

const App = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [evaluationResult, setEvaluationResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchConfig();
      setConfig(response);
    } catch (err) {
      console.error('Failed to fetch config:', err);
      setError(err.message || 'Failed to load policy configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async (content, options = {}) => {
    try {
      setEvaluating(true);
      setEvaluationResult(null);
      
      const policy = options.customPolicy || null;
      const result = await evaluateContent(content, policy);
      setEvaluationResult(result);
    } catch (err) {
      console.error('Evaluation failed:', err);
      setEvaluationResult({
        error: true,
        message: err.message || 'Evaluation failed. Please try again.',
      });
    } finally {
      setEvaluating(false);
    }
  };

  if (loading) {
    return (
      <div className="app-container">
        <Header />
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading policy configuration...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-container">
        <Header />
        <div className="error-state">
          <div className="error-icon">⚠</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={loadConfig} className="retry-button">
            Retry Connection
          </button>
          <p className="error-hint">
            Make sure the backend server is running on port 3002
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <div className="panel-container">
          {/* Column 1: Policy Configuration */}
          <section className="panel policy-section">
            <PolicyPanel config={config} onConfigUpdate={loadConfig} />
          </section>

          {/* Column 2: Evaluation & Results */}
          <section className="panel evaluation-section">
            <EvaluationPanel 
              config={config}
              onEvaluate={handleEvaluate}
              evaluating={evaluating}
            />
            <ResultsPanel result={evaluationResult} />
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
