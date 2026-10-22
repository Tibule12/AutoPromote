import React, { useEffect, useMemo, useState } from "react";
import {
  LOGO_DESIGN_DEFAULT,
  buildStudioLogoDesign,
  studioLogoMasterSvg,
  studioLogoPreviewUri,
} from "./studioLogoDesign";
import { rasterizeStudioArtwork } from "./studioGraphicsPackage";

function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function LogoSpacingInput({ value, locked, onCommit }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => setDraft(null), [value, locked]);
  const commit = () => {
    if (!locked && draft !== null && draft.trim() && Number.isFinite(Number(draft)))
      onCommit(Math.max(-2, Math.min(12, Number(draft))));
    setDraft(null);
  };
  return (
    <input
      aria-label="Logo letter spacing"
      type="number"
      min={-2}
      max={12}
      step={0.5}
      value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setDraft(null);
        e.stopPropagation();
      }}
    />
  );
}
export default function StudioLogoDesignPanel({
  onBuild,
  locked,
  duration,
  aspect,
  groups = [],
  layers = [],
  order = [],
}) {
  const [spec, setSpec] = useState({ ...LOGO_DESIGN_DEFAULT }),
    [animate, setAnimate] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(""),
    [variant, setVariant] = useState("colour");
  const width = Math.round(720 * (aspect || 16 / 9)),
    height = 720;
  const choices = groups.filter(g => g.name?.startsWith("Logo · "));
  useEffect(() => {
    if (!choices.some(g => g.id === selected)) setSelected(choices.at(-1)?.id || "");
  }, [groups, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const draft = useMemo(() => {
    try {
      const input = buildStudioLogoDesign(spec, {
        width,
        height,
        duration: Math.max(0.2, duration || 8),
      });
      return { input, svg: studioLogoMasterSvg(input.layers, { width, height }) };
    } catch (e) {
      return { error: e.message };
    }
  }, [spec, width, height, duration]);
  const change = (key, value) => {
    setSpec(s => ({ ...s, [key]: value }));
    setError("");
  };
  const act = async callback => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await callback();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const exportMaster = async format => {
    const group = choices.find(g => g.id === selected);
    if (!group) throw Error("Add or select a logo in this project.");
    const members = new Set(group.layerIds);
    if ([...members].some(id => !layers.some(l => l.id === id)))
      throw Error("Logo export needs a flat group of editable vector layers.");
    const current = order.filter(id => members.has(id)).map(id => layers.find(l => l.id === id));
    if (current.length !== members.size) throw Error("The logo layer order is incomplete.");
    const svg = studioLogoMasterSvg(current, { width, height, variant, group }),
      name = group.name.replace(/[^a-z0-9.-]+/gi, "-");
    const blob =
      format === "svg"
        ? new Blob([svg], { type: "image/svg+xml" })
        : await rasterizeStudioArtwork(svg, "Logo master");
    download(blob, `${name}-${variant}.${format}`);
  };
  return (
    <details
      className="advanced-tool-section studio-logo-design"
      data-testid="studio-logo-design-panel"
      open
    >
      <summary>Logo Workshop</summary>
      <p>
        Build a symbol and custom lettering. Every letter becomes editable curves, including its
        counters. Design the mark here, then animate its pieces in Motion.
      </p>
      <fieldset disabled={busy || locked}>
        <label>
          Brand name
          <input
            aria-label="Logo brand name"
            maxLength={32}
            value={spec.name}
            onChange={e => change("name", e.target.value)}
          />
        </label>
        <div className="studio-logo-family-grid" role="group" aria-label="Logo symbol family">
          {[
            ["flow", "Flow", "Ribbon ascent"],
            ["orbit", "Orbit", "Interlocking motion"],
            ["facet", "Facet", "Geometric structure"],
          ].map(([family, name, description]) => {
            let src;
            try {
              const input = buildStudioLogoDesign(
                { ...spec, name: spec.name.trim() || "Brand", family, layout: "symbol" },
                { width: 400, height: 400, duration: 8 }
              );
              src = studioLogoPreviewUri(
                studioLogoMasterSvg(input.layers, { width: 400, height: 400 })
              );
            } catch (e) {}
            return (
              <button
                key={family}
                type="button"
                aria-pressed={spec.family === family}
                onClick={() => change("family", family)}
              >
                <img src={src} alt="" />
                <strong>{name}</strong>
                <small>{description}</small>
              </button>
            );
          })}
        </div>
        <div className="motion-position-grid">
          <label>
            Layout
            <select
              aria-label="Logo layout"
              value={spec.layout}
              onChange={e => change("layout", e.target.value)}
            >
              <option value="horizontal">Horizontal lockup</option>
              <option value="stacked">Stacked lockup</option>
              <option value="symbol">Symbol only</option>
            </select>
          </label>
          <label>
            Lettering
            <select
              aria-label="Logo lettering"
              value={spec.weight}
              onChange={e => change("weight", Number(e.target.value))}
            >
              <option value={900}>Inter Black</option>
              <option value={600}>Inter SemiBold</option>
            </select>
          </label>
          <label>
            Letter spacing
            <LogoSpacingInput
              value={spec.tracking}
              locked={locked}
              onCommit={value => change("tracking", value)}
            />
          </label>
          <label>
            Symbol size
            <input
              aria-label="Logo symbol size"
              type="range"
              min={0.6}
              max={1.4}
              step={0.05}
              value={spec.symbolSize}
              onChange={e => change("symbolSize", Number(e.target.value))}
            />
          </label>
        </div>
        <div className="studio-logo-colours">
          {[
            ["primary", "Primary"],
            ["secondary", "Accent"],
            ["lettering", "Lettering"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={`Logo ${label.toLowerCase()} colour`}
                type="color"
                value={spec[key]}
                onChange={e => change(key, e.target.value)}
              />
            </label>
          ))}
        </div>
        <label>
          <input
            type="checkbox"
            aria-label="Logo gradient"
            checked={spec.gradient}
            onChange={e => change("gradient", e.target.checked)}
          />
          Gradient symbol
        </label>
        {draft.svg && (
          <div className="studio-logo-design-preview" data-testid="studio-logo-design-preview">
            <img src={studioLogoPreviewUri(draft.svg)} alt={`${spec.name} logo design preview`} />
          </div>
        )}
        <label>
          <input
            type="checkbox"
            aria-label="Animate logo assembly"
            checked={animate}
            onChange={e => setAnimate(e.target.checked)}
          />
          Assemble the pieces with editable motion keys
        </label>
        <button
          type="button"
          disabled={!!draft.error}
          onClick={() =>
            act(() => onBuild(buildStudioLogoDesign(spec, { width, height, duration, animate })))
          }
        >
          Add logo to timeline
        </button>
        {draft.error && <p role="alert">{draft.error}</p>}
      </fieldset>
      {!!choices.length && (
        <div className="studio-logo-master-export">
          <label>
            Logo in this project
            <select
              aria-label="Export logo group"
              value={selected}
              onChange={e => setSelected(e.target.value)}
              disabled={busy}
            >
              {choices.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Colour version
            <select
              aria-label="Export logo variant"
              value={variant}
              onChange={e => setVariant(e.target.value)}
              disabled={busy}
            >
              <option value="colour">Original colours</option>
              <option value="light">White</option>
              <option value="dark">Ink</option>
            </select>
          </label>
          <p>
            Transparent masters use the current vector shapes and base layout, before timeline
            animation.
          </p>
          <div className="motion-position-grid">
            <button type="button" disabled={busy} onClick={() => act(() => exportMaster("svg"))}>
              Download logo SVG
            </button>
            <button type="button" disabled={busy} onClick={() => act(() => exportMaster("png"))}>
              Download logo PNG
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      {busy && <p role="status">Preparing logo…</p>}
    </details>
  );
}
