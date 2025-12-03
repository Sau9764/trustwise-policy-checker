import { useState, useEffect, useCallback } from 'react';
import { 
  fetchHistory, 
  fetchHistoryStats, 
  rerunEvaluation, 
  deleteEvaluation,
  getEvaluation 
} from '../services/api';
import './HistoryPanel.css';

const HistoryPanel = ({ onRerunResult, onViewDetails }) => {
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    verdict: '',
    search: '',
  });
  const [rerunning, setRerunning] = useState(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const options = {
        page,
        limit: 10,
      };

      if (filters.verdict) {
        options.verdict = filters.verdict;
      }
      if (filters.search) {
        options.search = filters.search;
      }

      const result = await fetchHistory(options);
      setHistory(result.items || []);
      setTotalPages(result.totalPages || 1);

    } catch (err) {
      console.error('Failed to load history:', err);
      setError(err.message || 'Failed to load evaluation history');
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  const loadStats = useCallback(async () => {
    try {
      const result = await fetchHistoryStats();
      setStats(result);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleRerun = async (evaluationId) => {
    try {
      setRerunning(evaluationId);
      const result = await rerunEvaluation(evaluationId, { saveToHistory: true });
      
      // Refresh history after rerun
      await loadHistory();
      await loadStats();
      
      // Notify parent of new result
      if (onRerunResult) {
        onRerunResult(result.result);
      }
    } catch (err) {
      console.error('Failed to rerun evaluation:', err);
      setError(err.message || 'Failed to re-run evaluation');
    } finally {
      setRerunning(null);
    }
  };

  const handleDelete = async (evaluationId) => {
    if (!confirm('Are you sure you want to delete this evaluation?')) {
      return;
    }

    try {
      await deleteEvaluation(evaluationId);
      await loadHistory();
      await loadStats();
    } catch (err) {
      console.error('Failed to delete evaluation:', err);
      setError(err.message || 'Failed to delete evaluation');
    }
  };

  const handleViewDetails = async (evaluationId) => {
    try {
      const evaluation = await getEvaluation(evaluationId);
      setSelectedEvaluation(evaluation);
      setShowDetails(true);
      
      if (onViewDetails) {
        onViewDetails(evaluation);
      }
    } catch (err) {
      console.error('Failed to get evaluation details:', err);
      setError(err.message || 'Failed to load evaluation details');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPage(1); // Reset to first page on filter change
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadHistory();
  };

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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatLatency = (ms) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const truncateContent = (content, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  return (
    <div className="history-panel">
      <div className="history-header">
        <div className="history-title-row">
          <h2 className="history-title">
            <span className="history-icon">📜</span>
            Evaluation History
          </h2>
          <button 
            className="btn btn-ghost refresh-btn"
            onClick={() => { loadHistory(); loadStats(); }}
            disabled={loading}
          >
            🔄 Refresh
          </button>
        </div>

        {/* Stats Summary */}
        {stats && (
          <div className="history-stats">
            <div className="stat-item">
              <span className="stat-number">{stats.totalEvaluations}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-item stat-allow">
              <span className="stat-number">{stats.verdictCounts?.ALLOW || 0}</span>
              <span className="stat-label">Allowed</span>
            </div>
            <div className="stat-item stat-block">
              <span className="stat-number">{stats.verdictCounts?.BLOCK || 0}</span>
              <span className="stat-label">Blocked</span>
            </div>
            <div className="stat-item stat-warn">
              <span className="stat-number">{stats.verdictCounts?.WARN || 0}</span>
              <span className="stat-label">Warned</span>
            </div>
            <div className="stat-item">
              <span className="stat-number">{stats.recentEvaluations}</span>
              <span className="stat-label">Last 24h</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="history-filters">
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="text"
            name="search"
            className="search-input"
            placeholder="Search content or policy..."
            value={filters.search}
            onChange={handleFilterChange}
          />
          <button type="submit" className="btn btn-secondary search-btn">
            🔍
          </button>
        </form>
        <select
          name="verdict"
          className="filter-select"
          value={filters.verdict}
          onChange={handleFilterChange}
        >
          <option value="">All Verdicts</option>
          <option value="ALLOW">✓ ALLOW</option>
          <option value="BLOCK">✕ BLOCK</option>
          <option value="WARN">⚠ WARN</option>
          <option value="REDACT">◐ REDACT</option>
          <option value="ERROR">! ERROR</option>
        </select>
      </div>

      {/* Content */}
      <div className="history-content">
        {loading && (
          <div className="history-loading">
            <div className="loading-spinner"></div>
            <p>Loading history...</p>
          </div>
        )}

        {error && (
          <div className="history-error">
            <span className="error-icon">⚠</span>
            <p>{error}</p>
            <button 
              className="btn btn-secondary"
              onClick={() => { setError(null); loadHistory(); }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && history.length === 0 && (
          <div className="history-empty">
            <span className="empty-icon">📭</span>
            <h3>No evaluations yet</h3>
            <p>Run some evaluations to see them here</p>
          </div>
        )}

        {!loading && !error && history.length > 0 && (
          <div className="history-list">
            {history.map((item) => (
              <div key={item.evaluationId} className="history-item">
                <div className="history-item-header">
                  <div className={`verdict-badge ${getVerdictClass(item.result?.final_verdict)}`}>
                    <span className="verdict-icon-sm">
                      {getVerdictIcon(item.result?.final_verdict)}
                    </span>
                    {item.result?.final_verdict}
                  </div>
                  <div className="history-item-meta">
                    <span className="meta-date">
                      {formatDate(item.metadata?.evaluatedAt)}
                    </span>
                    <span className="meta-latency">
                      {formatLatency(item.result?.total_latency_ms)}
                    </span>
                  </div>
                </div>

                <div className="history-item-body">
                  <div className="history-content-preview">
                    {truncateContent(item.content)}
                  </div>
                  <div className="history-item-info">
                    <span className="policy-badge">
                      {item.policySnapshot?.name} v{item.policySnapshot?.version}
                    </span>
                    <span className="rules-count">
                      {item.policySnapshot?.rules?.length} rules
                    </span>
                  </div>
                </div>

                <div className="history-item-actions">
                  <button
                    className="btn btn-ghost action-btn"
                    onClick={() => handleViewDetails(item.evaluationId)}
                    title="View Details"
                  >
                    👁 View
                  </button>
                  <button
                    className="btn btn-primary action-btn rerun-btn"
                    onClick={() => handleRerun(item.evaluationId)}
                    disabled={rerunning === item.evaluationId}
                    title="Re-run with same policy"
                  >
                    {rerunning === item.evaluationId ? (
                      <>
                        <span className="loader-sm"></span>
                        Running...
                      </>
                    ) : (
                      <>🔄 Re-run</>
                    )}
                  </button>
                  <button
                    className="btn btn-ghost action-btn delete-btn"
                    onClick={() => handleDelete(item.evaluationId)}
                    title="Delete"
                  >
                    🗑
                  </button>
                </div>

                {/* Tags */}
                {item.metadata?.tags && item.metadata.tags.length > 0 && (
                  <div className="history-item-tags">
                    {item.metadata.tags.map((tag, idx) => (
                      <span key={idx} className="tag-badge">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && history.length > 0 && totalPages > 1 && (
        <div className="history-pagination">
          <button
            className="btn btn-ghost pagination-btn"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="btn btn-ghost pagination-btn"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}

      {/* Details Modal */}
      {showDetails && selectedEvaluation && (
        <div className="details-modal-overlay" onClick={() => setShowDetails(false)}>
          <div className="details-modal" onClick={(e) => e.stopPropagation()}>
            <div className="details-modal-header">
              <h3>Evaluation Details</h3>
              <button 
                className="btn btn-ghost close-btn"
                onClick={() => setShowDetails(false)}
              >
                ✕
              </button>
            </div>
            <div className="details-modal-body">
              <div className="detail-section">
                <h4>Content</h4>
                <pre className="detail-content">{selectedEvaluation.content}</pre>
              </div>
              
              <div className="detail-section">
                <h4>Result</h4>
                <div className={`detail-verdict ${getVerdictClass(selectedEvaluation.result?.final_verdict)}`}>
                  <span className="verdict-icon-lg">
                    {getVerdictIcon(selectedEvaluation.result?.final_verdict)}
                  </span>
                  <span>{selectedEvaluation.result?.final_verdict}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Policy Snapshot</h4>
                <div className="detail-policy">
                  <p><strong>Name:</strong> {selectedEvaluation.policySnapshot?.name}</p>
                  <p><strong>Version:</strong> {selectedEvaluation.policySnapshot?.version}</p>
                  <p><strong>Strategy:</strong> {selectedEvaluation.policySnapshot?.evaluation_strategy}</p>
                  <p><strong>Rules:</strong> {selectedEvaluation.policySnapshot?.rules?.length}</p>
                </div>
              </div>

              <div className="detail-section">
                <h4>Rule Results</h4>
                <div className="detail-rules">
                  {selectedEvaluation.result?.rule_results?.map((rule, idx) => (
                    <div key={idx} className={`detail-rule ${getVerdictClass(rule.verdict)}`}>
                      <div className="detail-rule-header">
                        <span className="rule-id">{rule.rule_id}</span>
                        <span className={`badge badge-${rule.verdict.toLowerCase()}`}>
                          {rule.verdict}
                        </span>
                      </div>
                      <p className="rule-reasoning">{rule.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="details-modal-footer">
              <button
                className="btn btn-primary"
                onClick={() => {
                  handleRerun(selectedEvaluation.evaluationId);
                  setShowDetails(false);
                }}
              >
                🔄 Re-run This Evaluation
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowDetails(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryPanel;

