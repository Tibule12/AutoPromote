import React, { useEffect, useState } from "react";

export default function StudioDirectorPosterControls({ value, disabled, onDraftChange, onUpdate }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const set = next => {
    setDraft(next);
    onDraftChange();
  };
  return (
    <fieldset className="studio-director-poster-controls" disabled={disabled}>
      <legend>Refine the motion design</legend>
      {draft.words.map((word, i) => (
        <label key={i}>
          Word {i + 1}
          <input
            aria-label={`Motion design word ${i + 1}`}
            value={word}
            maxLength={6}
            onChange={e =>
              set({
                ...draft,
                words: draft.words.map((w, n) => (n === i ? e.target.value.toUpperCase() : w)),
              })
            }
          />
        </label>
      ))}
      <label>
        Palette
        <select
          aria-label="Motion design palette"
          value={draft.palette}
          onChange={e => set({ ...draft, palette: e.target.value })}
        >
          <option value="orange_ink">Cream / orange / lime</option>
          <option value="cobalt_lime">Cream / cobalt / lime</option>
          <option value="pink_ink">Cream / pink / lime</option>
        </select>
      </label>
      <label>
        Energy
        <input
          aria-label="Motion design energy"
          type="number"
          min="0.5"
          max="1"
          step="0.05"
          value={draft.energy}
          onChange={e => set({ ...draft, energy: e.target.value })}
        />
      </label>
      <button
        className="studio-director-create"
        type="button"
        onClick={() =>
          onUpdate({ ...draft, energy: String(draft.energy).trim() ? Number(draft.energy) : NaN })
        }
      >
        Update motion design
      </button>
    </fieldset>
  );
}
