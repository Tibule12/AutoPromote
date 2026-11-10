import React, { useEffect, useState, useRef } from "react";
import { validateStudioMotionDrivers } from "./studioCompRigging";

function DriverNumber({ label, value, min, max, step, onCommit }) {
  const [draft, setDraft] = useState(String(value)),
    cancelled = useRef(false);
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="ap-comp-field">
      <span>{label}</span>
      <input
        className="ap-comp-select"
        aria-label={label}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (cancelled.current) {
            cancelled.current = false;
            setDraft(String(value));
            return;
          }
          const next = Number(draft);
          if (draft.trim() && Number.isFinite(next) && next >= min && next <= max) onCommit(next);
          else setDraft(String(value));
        }}
        onKeyDown={e => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            cancelled.current = true;
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export default function StudioNodeDriverControls({ layer, onChange }) {
  const drivers = Object.entries(layer?.motionDrivers || {}).filter(
    ([, driver]) => driver && ["spin", "pulse"].includes(driver.type)
  );
  if (!drivers.length) return null;
  const update = (property, patch) => {
    const next = {
      ...layer,
      motionDrivers: {
        ...layer.motionDrivers,
        [property]: { ...layer.motionDrivers[property], ...patch },
      },
    };
    validateStudioMotionDrivers(next);
    onChange(next);
  };
  return (
    <fieldset
      className="ap-node-drivers"
      style={{
        border: "1px solid #334155",
        borderRadius: 10,
        padding: 10,
        display: "grid",
        gap: 12,
      }}
    >
      <legend>Procedural motion</legend>
      {drivers.map(([property, driver]) => {
        const name = property[0].toUpperCase() + property.slice(1);
        return (
          <div key={property} style={{ display: "grid", gap: 8 }}>
            <label className="ap-comp-field">
              <span>
                {name} · {driver.type}
              </span>
              <input
                type="checkbox"
                aria-label={`${name} driver enabled`}
                checked={driver.enabled !== false}
                onChange={e => update(property, { enabled: e.target.checked })}
              />
            </label>
            {driver.type === "spin" ? (
              <DriverNumber
                label={`${name} spin speed`}
                value={driver.ratePerSecond}
                min={-1440}
                max={1440}
                step={1}
                onCommit={ratePerSecond => update(property, { ratePerSecond })}
              />
            ) : (
              <>
                <DriverNumber
                  label={`${name} pulse frequency`}
                  value={driver.frequencyHz}
                  min={0.05}
                  max={30}
                  step={0.05}
                  onCommit={frequencyHz => update(property, { frequencyHz })}
                />
                <DriverNumber
                  label={`${name} pulse amount`}
                  value={driver.amplitude}
                  min={-360}
                  max={360}
                  step={property === "scale" ? 0.01 : 1}
                  onCommit={amplitude => update(property, { amplitude })}
                />
              </>
            )}
          </div>
        );
      })}
    </fieldset>
  );
}
