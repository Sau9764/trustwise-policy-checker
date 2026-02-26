import PolicySettingsContent from './PolicySettingsContent';

/**
 * Thin wrapper around PolicySettingsContent for backwards compatibility.
 * The main app uses SettingsDrawer which embeds PolicySettingsContent directly.
 */
const PolicyPanel = (props) => {
  return <PolicySettingsContent {...props} />;
};

export default PolicyPanel;
