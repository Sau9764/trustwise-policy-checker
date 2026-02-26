# Trustwise Client UI Design

This document describes the frontend layout, theming, and settings behaviour for the Trustwise Policy Engine client.

## Layout

- **Single centered content area**: The main view uses one column, centred with a max width of 720px for the Evaluate tab. There is no left-hand configuration column on the main page.
- **Evaluate tab**: Contains:
  - One prominent text area for “Content to Evaluate”
  - Quick Fill chips/buttons (Safe Content, PII Content, Unprofessional, Mixed Issues) to insert sample content
  - Clear and “Evaluate Content” actions
  - Evaluation results rendered below the form in the same column
- **History tab**: Unchanged in behaviour; uses a centred max-width container for consistency.

```
+--------------------------------------------------+
| Header (Trustwise | API Docs | Light/Dark | Settings) |
+--------------------------------------------------+
| [Evaluate] [History]                              |
|                                                    |
|     +----------------------------------------+     |
|     | Content to Evaluate                    |     |
|     | [text area]                            |     |
|     |                                        |     |
|     +----------------------------------------+     |
|     Quick Fill: [Safe] [PII] [Unprofessional] ...  |
|     [Clear]              [Evaluate Content]        |
|     +----------------------------------------+     |
|     | Results (when present)                 |     |
|     +----------------------------------------+     |
+--------------------------------------------------+
```

## Theme

- **Default**: Light (white) theme. Background and text use CSS variables tuned for light mode.
- **Toggle**: Header includes a Light / Dark control (e.g. “Light” and “Dark” buttons). The selected theme is persisted in `localStorage` under the key `trustwise-theme` and reapplied on load.
- **Implementation**: `data-theme="light"` (default) or `data-theme="dark"` on the document root; CSS variables in `App.css` define both sets. A small `ThemeContext` (or equivalent) applies the attribute and reads/writes `localStorage`.

## Settings (Google-style)

- **Entry point**: A “Settings” control in the top-right of the header (with or without icon), similar to a profile/account entry on Google apps.
- **Behaviour**: Clicking it opens a **right-side slide-out drawer** (not a full-page view). The drawer overlays or pushes content and contains the full policy configuration.
- **Drawer content**:
  - **Policy strategy**: Dropdown for evaluation strategy (`all`, `any`, `weighted_threshold`). If `weighted_threshold`, a threshold slider is shown. Changes are saved via the config API.
  - **Default action**: Dropdown for default action (e.g. block, redact, warn, allow). Changes are saved via the config API.
  - **Rules list**: Scrollable area (e.g. `max-height` + `overflow-y: auto`) listing all rules in an “infinite scrolling” style (all rules from config; no backend pagination). Each rule can be expanded to show description and judge prompt. Add / Edit / Delete behaviour is unchanged (same modals and API calls).
- **Closing**: Close button inside the drawer and click-outside (backdrop) or Escape close the drawer.

```
+--------------------------------+  +------------------+
| Main content                    |  | Policy settings  |
|                                 |  | [Close]          |
|                                 |  |                  |
|                                 |  | Strategy: [v]    |
|                                 |  | Default: [v]     |
|                                 |  | Rules (scroll)   |
|                                 |  | + Add Rule        |
|                                 |  | [rule 1] [edit][x]|
|                                 |  | [rule 2] ...     |
+--------------------------------+  +------------------+
```

## Quick Fill

- **Placement**: Directly below the content text area, before the Clear / Evaluate actions.
- **Behaviour**: Four preset buttons (Safe Content, PII Content, Unprofessional, Mixed Issues). Clicking one replaces the current text area content with the corresponding sample. No submission; user can edit and then click “Evaluate Content”.

## Components (reference)

| Component | Role |
|-----------|------|
| `Header` | Brand, API Docs link, theme toggle, Settings button |
| `EvaluationPanel` | Centred form: text area, Quick Fill, Clear, Evaluate |
| `ResultsPanel` | Renders evaluation result below the form |
| `SettingsDrawer` | Right-side drawer; contains `PolicySettingsContent` |
| `PolicySettingsContent` | Editable strategy, default action, scrollable rules list, rule CRUD (add/edit/delete modals) |
| `PolicyPanel` | Thin wrapper around `PolicySettingsContent` for compatibility |

All changes are frontend-only; no backend or API contract changes.
