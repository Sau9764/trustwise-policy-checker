import './Header.css';

const Header = () => {
  return (
    <header className="header">
      <div className="header-content">
        <div className="header-brand">
          <div className="logo">
            <span className="logo-icon">🛡️</span>
            <span className="logo-text">Trustwise</span>
          </div>
          <span className="tagline">Policy Engine with LLM Judges</span>
        </div>
        
        <div className="header-actions">
          <a 
            href="http://localhost:3002/api/docs" 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
          >
            <span>📚</span>
            API Docs
          </a>
        </div>
      </div>
    </header>
  );
};

export default Header;
