import { useTheme } from '../contexts/ThemeContext';
import './Header.css';

const Header = ({ onOpenSettings }) => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-brand">
          <div className="logo">
            <span className="logo-icon" aria-hidden>🛡️</span>
            <span className="logo-text">Trustwise</span>
          </div>
          <span className="tagline">Policy Engine with LLM Judges</span>
        </div>

        <div className="header-actions">
          <a
            href="http://localhost:3002/api-docs"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <span aria-hidden>📚</span>
            API Docs
          </a>
          <div className="theme-toggle" role="group" aria-label="Theme">
            <button
              type="button"
              className={`theme-btn ${theme === 'light' ? 'active' : ''}`}
              onClick={() => setTheme('light')}
              aria-pressed={theme === 'light'}
              aria-label="Light theme"
              title="Light theme"
            >
              <span aria-hidden>☀️</span>
              Light
            </button>
            <button
              type="button"
              className={`theme-btn ${theme === 'dark' ? 'active' : ''}`}
              onClick={() => setTheme('dark')}
              aria-pressed={theme === 'dark'}
              aria-label="Dark theme"
              title="Dark theme"
            >
              <span aria-hidden>🌙</span>
              Dark
            </button>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-settings"
            onClick={onOpenSettings}
            aria-label="Open policy settings"
            title="Policy settings"
          >
            <span className="settings-icon" aria-hidden>⚙️</span>
            Settings
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
