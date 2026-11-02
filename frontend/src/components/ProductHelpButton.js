import React from 'react';

// The affordance emits only a stable catalogue ID. It has no project callbacks.
export default function ProductHelpButton({ featureId, label = 'Help', workspaceType }) {
  return <button type="button" className="product-help-affordance"
    data-help-feature-id={featureId} aria-label={`Help: ${label}`} title="What is this?"
    onClick={() => window.dispatchEvent(new CustomEvent('autopromote:product-help', {
      detail: { selected_feature_id: featureId, ...(workspaceType ? { workspace_type: workspaceType } : {}) },
    }))}>? <span>{label}</span></button>;
}
