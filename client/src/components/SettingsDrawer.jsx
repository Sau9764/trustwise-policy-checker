import { useEffect } from 'react';
import PolicySettingsContent from './PolicySettingsContent';
import './SettingsDrawer.css';

const SettingsDrawer = ({ isOpen, onClose, config, onConfigUpdate }) => {
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="settings-drawer-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Policy settings"
      >
        <div className="settings-drawer-header">
          <h2 className="settings-drawer-title">Policy settings</h2>
          <button
            type="button"
            className="settings-drawer-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>
        <div className="settings-drawer-body">
          <PolicySettingsContent config={config} onConfigUpdate={onConfigUpdate} />
        </div>
      </aside>
    </>
  );
};

export default SettingsDrawer;
