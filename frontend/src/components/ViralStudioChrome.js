import React from "react";

export const VIRAL_STUDIO_WORKSPACE_MODES = [
  {
    id: "quick",
    label: "Quick Create",
    shortLabel: "Quick",
    helper: "Guided story, captions and B-roll with fewer controls.",
  },
  {
    id: "creator",
    label: "Creator Studio",
    shortLabel: "Creator",
    helper: "Full timeline control for daily professional publishing.",
  },
  {
    id: "signature",
    label: "Signature Lab",
    shortLabel: "Signature",
    helper: "Advanced transformation tuning with the same safe project state.",
  },
];

const QUICK_TOOL_IDS = new Set(["moments", "hook", "captions", "broll", "export"]);

export const normalizeViralStudioWorkspaceMode = value =>
  VIRAL_STUDIO_WORKSPACE_MODES.some(mode => mode.id === value) ? value : "creator";

export const getViralStudioToolsForMode = (tools, mode) => {
  const normalizedMode = normalizeViralStudioWorkspaceMode(mode);
  if (normalizedMode !== "quick") return tools;
  return tools.filter(tool => QUICK_TOOL_IDS.has(tool.id));
};

export function StudioWorkspaceModeSwitch({ mode, onChange }) {
  const normalizedMode = normalizeViralStudioWorkspaceMode(mode);
  const activeMode =
    VIRAL_STUDIO_WORKSPACE_MODES.find(option => option.id === normalizedMode) ||
    VIRAL_STUDIO_WORKSPACE_MODES[1];

  return (
    <div className="studio-workspace-mode" data-testid="studio-workspace-mode">
      <div className="studio-workspace-mode__tabs" role="tablist" aria-label="Studio mode">
        {VIRAL_STUDIO_WORKSPACE_MODES.map(option => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-label={option.label}
            aria-selected={normalizedMode === option.id}
            className={normalizedMode === option.id ? "is-active" : ""}
            data-testid={`studio-mode-${option.id}`}
            title={option.helper}
            onClick={() => onChange(option.id)}
          >
            <span>{option.shortLabel}</span>
          </button>
        ))}
      </div>
      <small>{activeMode.helper}</small>
    </div>
  );
}

export function CreativeToolRail({ tools, mode, activeTool, onSelect }) {
  const visibleTools = getViralStudioToolsForMode(tools, mode);

  return (
    <nav
      className="creative-tool-rail"
      aria-label="Creative tools"
      data-workspace-mode={normalizeViralStudioWorkspaceMode(mode)}
    >
      {visibleTools.map(tool => (
        <button
          key={tool.id}
          type="button"
          className={activeTool === tool.id ? "is-active" : ""}
          aria-pressed={activeTool === tool.id}
          onClick={() => onSelect(tool.id)}
        >
          <span aria-hidden="true">{tool.icon}</span>
          <strong>{tool.label}</strong>
        </button>
      ))}
    </nav>
  );
}

export function ViralStudioHeader({
  projectTitle,
  clipFinderCost,
  clipRenderCost,
  transcribeCost,
  creditsRemaining,
  momentsCount,
  brollCount,
  hookEnabled,
  workspaceMode,
  onWorkspaceModeChange,
  canUndo,
  onUndo,
  canRedo,
  onRedo,
  onClose,
}) {
  return (
    <header className="studio-header">
      <div className="studio-header-copy">
        <div className="studio-brand-lockup">
          <span className="studio-brand-mark" aria-hidden="true">
            A
          </span>
          <strong>AutoPromote</strong>
        </div>
        <div className="studio-project-title">
          <span>Viral Clip Studio</span>
          <h3>{projectTitle}</h3>
        </div>
        <div className="studio-billing-strip">
          <span className="studio-billing-pill is-included">Studio included</span>
          <span className="studio-billing-pill">
            Scan {clipFinderCost} · Render {clipRenderCost} · Audio {transcribeCost} credits
          </span>
          <span className="studio-billing-pill is-balance">
            {creditsRemaining} credits left · Top up anytime
          </span>
        </div>
      </div>

      <div className="studio-header-center">
        <StudioWorkspaceModeSwitch mode={workspaceMode} onChange={onWorkspaceModeChange} />
        <div className="studio-header-status">
          <div className="studio-status-pill">
            <span className="studio-status-label">Moments</span>
            <strong>{momentsCount}</strong>
          </div>
          <div className="studio-status-pill">
            <span className="studio-status-label">B-Roll</span>
            <strong>{brollCount} beats</strong>
          </div>
          <div className="studio-status-pill">
            <span className="studio-status-label">Hook</span>
            <strong>{hookEnabled ? "On" : "Off"}</strong>
          </div>
        </div>
      </div>

      <div className="studio-header-actions">
        <span className="studio-autosave-state">● Local edit active</span>
        <span className="studio-credit-safe">● No render credits used</span>
        <button
          type="button"
          className="tool-btn tool-btn-compact"
          onClick={onUndo}
          disabled={!canUndo}
          data-testid="studio-undo-button"
          title="Undo (Ctrl/Cmd+Z)"
          style={{ opacity: canUndo ? 1 : 0.5 }}
        >
          ↶ Undo
        </button>
        <button
          type="button"
          className="tool-btn tool-btn-compact"
          onClick={onRedo}
          disabled={!canRedo}
          data-testid="studio-redo-button"
          title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
          style={{ opacity: canRedo ? 1 : 0.5 }}
        >
          ↷ Redo
        </button>
        <button
          type="button"
          className="close-btn"
          aria-label="Close Clip Studio"
          title="Close studio"
          onClick={onClose}
        >
          &times;
        </button>
      </div>
    </header>
  );
}

const INSPECTOR_TABS = [
  { id: "cut", label: "Cut", icon: "✂" },
  { id: "hook", label: "Hook", icon: "✦" },
  { id: "captions", label: "Captions", icon: "CC" },
  { id: "pacing", label: "Pacing", icon: "≋" },
  { id: "broll", label: "B-roll", icon: "▣" },
  { id: "sound", label: "Sound", icon: "♫" },
];

export function StudioInspectorTabs({ mode, activeTab, onSelect }) {
  const visibleTabs =
    normalizeViralStudioWorkspaceMode(mode) === "quick"
      ? INSPECTOR_TABS.filter(tab => ["hook", "captions", "broll"].includes(tab.id))
      : INSPECTOR_TABS;

  return (
    <div className="clip-inspector-tabs" role="tablist" aria-label="Clip Studio tools">
      {visibleTabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          className={activeTab === tab.id ? "is-active" : ""}
          onClick={() => onSelect(tab.id)}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
