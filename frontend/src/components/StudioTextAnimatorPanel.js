import React from "react";
import {
  TEXT_ANIMATOR_DEFAULT,
  TEXT_ANIMATOR_BOUNDS,
  validateStudioTextAnimation,
} from "./studioTextAnimator";

const labels = {
  stagger: "Stagger",
  fromX: "Letter travel X (em)",
  fromY: "Letter travel Y (em)",
  fromScale: "Starting scale",
  fromRotation: "Starting rotation",
  fromOpacity: "Starting opacity",
  tracking: "Starting spread",
  rangeStart: "Range start (%)",
  rangeEnd: "Range end (%)",
};
function NumberField({ field, value, onChange }) {
  const [draft, setDraft] = React.useState(null);
  React.useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft !== null && draft.trim() && Number.isFinite(Number(draft)))
      onChange(
        Math.max(
          TEXT_ANIMATOR_BOUNDS[field][0],
          Math.min(TEXT_ANIMATOR_BOUNDS[field][1], Number(draft))
        )
      );
    setDraft(null);
  };
  return (
    <label>
      <span>{labels[field]}</span>
      <input
        aria-label={labels[field]}
        type="number"
        min={TEXT_ANIMATOR_BOUNDS[field][0]}
        max={TEXT_ANIMATOR_BOUNDS[field][1]}
        step={
          field === "fromRotation" || field.startsWith("range") || field === "stagger" ? 1 : 0.05
        }
        value={draft ?? value}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(null);
          e.stopPropagation();
        }}
      />
    </label>
  );
}
export default function StudioTextAnimatorPanel({ layer, locked, onChange, onBuild, onDisable }) {
  const [error, setError] = React.useState("");
  const spec = layer.textAnimator;
  const change = next => {
    if (locked) return;
    try {
      validateStudioTextAnimation({ ...layer, textAnimator: next });
      onChange(next);
      setError("");
    } catch (e) {
      setError(e.message);
    }
  };
  return (
    <details className="advanced-tool-section studio-text-animator" open>
      <summary>Text choreography</summary>
      <p>
        Animate letters or words while keeping your copy editable. Text progress is an ordinary
        timeline property: reverse it, hold it or shape its curve in Motion.
      </p>
      <fieldset disabled={locked} style={{ border: 0, padding: 0, minWidth: 0 }}>
        {!spec ? (
          <button
            type="button"
            onClick={() => {
              if (locked) return;
              try {
                validateStudioTextAnimation({
                  ...layer,
                  textAnimator: { ...TEXT_ANIMATOR_DEFAULT },
                });
                onBuild({ ...TEXT_ANIMATOR_DEFAULT });
                setError("");
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Animate this title
          </button>
        ) : (
          <>
            <div className="motion-position-grid">
              <label>
                <span>Animate by</span>
                <select
                  aria-label="Animate text by"
                  value={spec.unit}
                  onChange={e => change({ ...spec, unit: e.target.value })}
                >
                  <option value="character">Letters</option>
                  <option value="word">Words</option>
                </select>
              </label>
              <label>
                <span>Order</span>
                <select
                  aria-label="Text animation order"
                  value={spec.order}
                  onChange={e => change({ ...spec, order: e.target.value })}
                >
                  <option value="forward">First to last</option>
                  <option value="reverse">Last to first</option>
                  <option value="center_out">Center out</option>
                  <option value="edges_in">Edges in</option>
                </select>
              </label>
              <label>
                <span>Settle</span>
                <select
                  aria-label="Text settling curve"
                  value={spec.easing}
                  onChange={e => change({ ...spec, easing: e.target.value })}
                >
                  <option value="linear">Linear</option>
                  <option value="ease_out">Ease out</option>
                  <option value="ease_in_out">Ease in/out</option>
                  <option value="back_out">Overshoot</option>
                </select>
              </label>
              {Object.keys(TEXT_ANIMATOR_BOUNDS).map(field => (
                <NumberField
                  key={`${layer.id}:${field}:${locked}`}
                  field={field}
                  value={spec[field]}
                  onChange={value => change({ ...spec, [field]: value })}
                />
              ))}
            </div>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (!locked) onBuild(spec);
              }}
            >
              Rebuild entrance keys
            </button>
            <button
              type="button"
              disabled={locked}
              onClick={() => {
                if (!locked) onDisable();
              }}
            >
              Remove text animator
            </button>
            <p>
              Rebuild replaces only this title’s Text progress keys. Other layer motion remains.
              Supported copy: Inter Latin letters, numbers and punctuation.
            </p>
          </>
        )}
      </fieldset>
      {locked && <p role="status">Unlock the title track to edit choreography.</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
