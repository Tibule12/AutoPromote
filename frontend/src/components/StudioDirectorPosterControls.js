import React, { useEffect, useState } from "react";

export const DIRECTOR_POSTER_LOCKUP_PRESETS = [
  {
    id: "broadcast_launch",
    label: "Broadcast Launch",
    words: ["MOTION", "STUDIO", "CREATE"],
    palette: "orange_ink",
    energy: 0.9,
  },
  {
    id: "cyber_festival",
    label: "Cyber Festival",
    words: ["FUTURE", "SIGNAL", "VISION"],
    palette: "cyber_cyan",
    energy: 0.95,
  },
  {
    id: "golden_premiere",
    label: "Golden Premiere",
    words: ["CINEMA", "GOLDEN", "SELECT"],
    palette: "cinema_gold",
    energy: 0.85,
  },
  {
    id: "emerald_studio",
    label: "Emerald Studio",
    words: ["DESIGN", "SYSTEM", "VECTOR"],
    palette: "emerald_noir",
    energy: 0.88,
  },
];

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
      <div className="studio-director-preset-pills" data-testid="director-poster-presets">
        {DIRECTOR_POSTER_LOCKUP_PRESETS.map(preset => (
          <button
            key={preset.id}
            type="button"
            className="studio-director-preset-pill"
            data-testid={`director-poster-preset-${preset.id}`}
            onClick={() =>
              set({
                ...draft,
                words: [...preset.words],
                palette: preset.palette,
                energy: preset.energy,
              })
            }
          >
            {preset.label}
          </button>
        ))}
      </div>
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
          <option value="cyber_cyan">Ice / navy / cyan / magenta</option>
          <option value="cinema_gold">Ivory / espresso / cinema gold</option>
          <option value="emerald_noir">Mint / forest / emerald / lime</option>
          <option value="ultraviolet_pulse">Lavender / midnight / violet / cyan</option>
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
