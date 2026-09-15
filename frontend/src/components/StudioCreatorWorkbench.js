import React, { useEffect, useMemo, useRef } from "react";

export const CREATOR_PREVIEW_SECTIONS = [
  ["layers", "Layers"],
  ["motion", "Motion"],
  ["audio", "Audio"],
  ["podcast", "Multicam"],
  ["reactions", "Reactions"],
  ["intros", "Introductions"],
  ["context", "Context"],
  ["text", "Text"],
  ["composite", "Compositing"],
  ["effects", "Creator FX"],
  ["assist", "Templates + AI"],
];

export const DEFAULT_CREATOR_PREVIEW = {
  enabled: true,
  section: "reactions",
  activeDemo: "",
  intensity: 62,
  duration: 0.8,
  zoom: 1.34,
  x: 78,
  y: 68,
  color: "#ffcb67",
  accent: "#7457ff",
  text: "THIS CHANGED EVERYTHING",
  name: "",
  role: "",
  entity: "",
  emoji: "🤯",
  rank: 3,
  tracking: false,
  maskShape: "person",
  transition: "whip",
  introStyle: "cinematic",
  reactionMode: "instant",
  comparisonLeft: "",
  comparisonRight: "",
};

const DEMO_LABELS = {
  layer_stack: "Seven-layer composition",
  reaction_freeze: "Reaction freeze",
  reaction_punch: "Reaction punch-in",
  reaction_montage: "Multi-person reactions",
  instant_replay: "Instant replay",
  slow_replay: "Slow reaction replay",
  speaker_intro: "Speaker freeze intro",
  contextual_logos: "Contextual logos",
  contextual_number: "Contextual number",
  contextual_screen: "Screenshot / UI insert",
  arrow: "Tracked arrow",
  circle: "Tracked circle",
  highlight: "Animated highlight",
  kinetic_text: "Kinetic typography",
  caption_emphasis: "Caption emphasis",
  emoji: "Reaction emoji",
  comparison: "Comparison layout",
  ranking: "Ranking graphic",
  quote: "Quote card",
  mask: "Shape mask",
  cutout: "Subject cutout proxy",
  background: "Background replacement proxy",
  text_behind: "Text behind subject proxy",
  tracking: "Tracked graphic proxy",
  censor: "Tracked censor proxy",
  screen_replace: "Screen replacement proxy",
  cleanup: "Object cleanup proxy",
  clone: "Clone composition",
  parallax: "Parallax scene",
  punch_zoom: "Punch zoom",
  snap_zoom: "Snap zoom",
  crash_zoom: "Crash zoom",
  micro_freeze: "Micro freeze",
  shake: "Impact shake",
  stabilization: "Stabilized preview",
  transition: "Creator transition",
  meme: "Meme cutaway",
  beat_sync: "Beat-synced impact",
  director: "Context-aware suggestion",
};

const SectionButton = ({ id, active, onClick, children }) => (
  <button
    type="button"
    className={active ? "is-active" : ""}
    aria-pressed={active}
    onClick={onClick}
    data-testid={`creator-section-${id}`}
  >
    {children}
  </button>
);

const DemoButton = ({ id, active, onClick, children, proxy = false, timeline = false }) => (
  <button
    type="button"
    className={`creator-demo-button ${active ? "is-active" : ""}`}
    aria-pressed={active}
    onClick={onClick}
    data-testid={`creator-demo-${id}`}
  >
    <span>{children}</span>
    <small>{timeline ? "Add to timeline" : proxy ? "Preview proxy" : "Browser preview"}</small>
  </button>
);

export function StudioCreatorWorkbench({
  value,
  onChange,
  onOpenTool,
  onFreeze,
  onResume,
  onApplyMotionPreset,
  onApplySpeedRamp,
  onAddImpactSound,
  onApplyBeatSync,
  onApplyLayerStack,
  onSaveTemplate,
  onApplyDirectorSuggestion,
  onInsertTitle,
  cameraCount = 1,
  beatCount = 0,
  layerCount = 1,
  transcriptEvidence = "",
}) {
  const state = { ...DEFAULT_CREATOR_PREVIEW, ...(value || {}) };
  const set = changes => onChange({ ...state, ...changes, enabled: true });
  const activate = (activeDemo, extras = {}) => set({ activeDemo, ...extras });
  const demo = state.activeDemo;
  const reviewedTranscriptEvidence = String(transcriptEvidence || "").trim();

  const demoGroups = {
    layers: (
      <>
        <div className="creator-workbench-callout">
          <strong>{layerCount} visual layer{layerCount === 1 ? "" : "s"} in your project</strong>
          <small>Build a composition with your own footage, titles and graphics. Select each layer to edit its timing and transform.</small>
        </div>
        <div className="creator-demo-grid">
          <DemoButton id="layer_stack" active={demo === "layer_stack"} onClick={() => {
            onApplyLayerStack?.();
          }}>Show composition timeline</DemoButton>
        </div>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("cut")}>Open multitrack timeline and cutting →</button>
      </>
    ),
    motion: (
      <>
        <div className="creator-demo-grid is-three">
          {[["punch_zoom", "Punch zoom"], ["snap_zoom", "Snap zoom"], ["crash_zoom", "Crash zoom"]].map(([id, label]) => (
            <DemoButton key={id} id={id} timeline active={false} onClick={() => {
              onApplyMotionPreset?.(id, Number(state.zoom));
            }}>{label}</DemoButton>
          ))}
        </div>
        <label className="creator-range"><span>Zoom amount <b>{Number(state.zoom).toFixed(2)}×</b></span><input aria-label="Creator zoom amount" type="range" min="1.05" max="2" step="0.01" value={state.zoom} onChange={event => set({ zoom: Number(event.target.value) })} /></label>
        <p className="inspector-note">Set the amount, then add a zoom at the playhead. Adjust the resulting three keys in Motion; undo restores the previous edit.</p>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("motion")}>Open full X/Y/scale/rotation/opacity/easing editor →</button>
      </>
    ),
    audio: (
      <>
        <div className="creator-workbench-callout is-audio"><strong>Automation is audible in preview</strong><small>Drag timing, change gain and easing from the Sound inspector.</small></div>
        <div className="creator-inline-actions">
          <button type="button" onClick={() => onOpenTool("sound")}>Open audio envelopes</button>
          <button type="button" onClick={onAddImpactSound}>Add impact at playhead</button>
          <button type="button" onClick={onApplyBeatSync}>Snap impact to beat</button>
        </div>
        <p className="inspector-note">{beatCount ? `${beatCount} detected music beats. The impact uses the nearest beat in your timeline.` : "No detected music beats yet. Choose a music track in Sound to analyse its rhythm."}</p>
      </>
    ),
    podcast: (
      <>
        <div className="creator-workbench-callout"><strong>{cameraCount} source angle{cameraCount === 1 ? "" : "s"} in this layout</strong><small>Build synchronized 2–4 camera edits for interviews, events, tutorials or podcasts. Every angle remains real source footage—not B-roll or a duplicated reaction.</small></div>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("reframe")}>Open source framing and multicamera layouts →</button>
      </>
    ),
    reactions: (
      <>
        <div className="creator-demo-grid is-three">
          <DemoButton id="reaction_freeze" active={demo === "reaction_freeze"} onClick={() => { activate("reaction_freeze"); onFreeze?.(); }}>Freeze reaction</DemoButton>
          <DemoButton id="reaction_punch" active={demo === "reaction_punch"} onClick={() => { activate("reaction_punch"); onFreeze?.(); }}>Freeze + punch</DemoButton>
          <DemoButton id="reaction_montage" active={demo === "reaction_montage"} onClick={() => activate("reaction_montage")}>Reaction montage</DemoButton>
          <DemoButton id="instant_replay" active={demo === "instant_replay"} onClick={() => activate("instant_replay", { reactionMode: "instant" })}>Instant replay</DemoButton>
          <DemoButton id="slow_replay" active={demo === "slow_replay"} onClick={() => activate("slow_replay", { reactionMode: "slow" })}>Slow replay</DemoButton>
          <button type="button" className="creator-demo-button" onClick={onResume}><span>Resume programme</span><small>Continue video</small></button>
        </div>
        <label className="creator-range"><span>Freeze hold <b>{Number(state.duration).toFixed(1)}s</b></span><input aria-label="Reaction freeze duration" type="range" min="0.3" max="1.5" step="0.1" value={state.duration} onChange={event => set({ duration: Number(event.target.value) })} /></label>
      </>
    ),
    intros: (
      <>
        <div className="creator-demo-grid">
          <DemoButton id="speaker_intro" active={demo === "speaker_intro"} onClick={() => { activate("speaker_intro"); onFreeze?.(); }}>Freeze-frame speaker intro</DemoButton>
        </div>
        <label className="creator-text-field"><span>Name</span><input aria-label="Speaker intro name" placeholder="Enter the speaker's name" value={state.name} onChange={event => set({ name: event.target.value })} /></label>
        <label className="creator-text-field"><span>Role / handle</span><input aria-label="Speaker intro role" value={state.role} onChange={event => set({ role: event.target.value })} /></label>
        <div className="creator-style-row">{["clean", "bold", "cinematic", "playful", "creator", "minimal"].map(style => <button key={style} type="button" className={state.introStyle === style ? "is-active" : ""} onClick={() => set({ introStyle: style })}>{style}</button>)}</div>
        <button type="button" className="creator-linked-tool" disabled={!state.name.trim() || !onInsertTitle} onClick={() => onInsertTitle({ preset: "lower_third", text: [state.name.trim(), state.role.trim()].filter(Boolean).join("\n") })}>Add editable lower third to timeline</button>
      </>
    ),
    context: (
      <>
        <div className="creator-demo-grid is-three">
          <DemoButton id="contextual_logos" active={demo === "contextual_logos"} onClick={() => activate("contextual_logos")}>Brand sequence</DemoButton>
          <DemoButton id="contextual_number" active={demo === "contextual_number"} onClick={() => activate("contextual_number")}>Number callout</DemoButton>
          <DemoButton id="contextual_screen" active={demo === "contextual_screen"} onClick={() => activate("contextual_screen")}>UI / screenshot</DemoButton>
          <DemoButton id="arrow" active={demo === "arrow"} onClick={() => activate("arrow")}>Arrow</DemoButton>
          <DemoButton id="circle" active={demo === "circle"} onClick={() => activate("circle")}>Circle</DemoButton>
          <DemoButton id="highlight" active={demo === "highlight"} onClick={() => activate("highlight")}>Highlight</DemoButton>
          <DemoButton id="comparison" active={demo === "comparison"} onClick={() => activate("comparison")}>A/B comparison</DemoButton>
          <DemoButton id="ranking" active={demo === "ranking"} onClick={() => activate("ranking")}>Ranking / list</DemoButton>
        </div>
        <label className="creator-text-field"><span>Your label / value</span><input aria-label="Contextual graphic value" placeholder="Enter the exact value or label" value={state.entity} onChange={event => set({ entity: event.target.value })} /></label>
        {demo === "comparison" ? <>
          <label className="creator-text-field"><span>Left option</span><input aria-label="Comparison left option" value={state.comparisonLeft} onChange={event => set({ comparisonLeft: event.target.value })} /></label>
          <label className="creator-text-field"><span>Right option</span><input aria-label="Comparison right option" value={state.comparisonRight} onChange={event => set({ comparisonRight: event.target.value })} /></label>
        </> : null}
        <label className="creator-range"><span>Horizontal position <b>{Math.round(state.x)}%</b></span><input aria-label="Context graphic horizontal position" type="range" min="10" max="90" value={state.x} onChange={event => set({ x: Number(event.target.value) })} /></label>
        <label className="creator-range"><span>Vertical position <b>{Math.round(state.y)}%</b></span><input aria-label="Context graphic vertical position" type="range" min="12" max="84" value={state.y} onChange={event => set({ y: Number(event.target.value) })} /></label>
        <button type="button" className="creator-linked-tool" disabled={!state.entity.trim() || !onInsertTitle} onClick={() => onInsertTitle({ preset: "label", text: state.entity.trim(), position: { x: state.x, y: state.y } })}>Add editable callout to timeline</button>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("broll")}>Import your own logo or screenshot →</button>
      </>
    ),
    text: (
      <>
        <div className="creator-demo-grid is-three">
          <DemoButton id="kinetic_text" active={demo === "kinetic_text"} onClick={() => activate("kinetic_text")}>Kinetic title</DemoButton>
          <DemoButton id="caption_emphasis" active={demo === "caption_emphasis"} onClick={() => activate("caption_emphasis")}>Caption emphasis</DemoButton>
          <DemoButton id="quote" active={demo === "quote"} onClick={() => activate("quote")}>Quote card</DemoButton>
        </div>
        <label className="creator-text-field"><span>Text</span><textarea aria-label="Creator effect text" value={state.text} onChange={event => set({ text: event.target.value })} /></label>
        <button type="button" className="creator-linked-tool" disabled={!state.text.trim() || !onInsertTitle} onClick={() => onInsertTitle({ preset: "headline", text: state.text.trim() })}>Add editable title to timeline</button>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("titles")}>Open free-form title controls →</button>
      </>
    ),
    composite: (
      <>
        <div className="creator-proxy-note"><span>PROXY</span><p>These browser treatments make the intended composition reviewable. They do not claim that AI tracking or segmentation has run.</p></div>
        <div className="creator-demo-grid is-three">
          {[["mask", "Shape mask", false], ["cutout", "Subject cutout", true], ["background", "Replace background", true], ["text_behind", "Text behind person", true], ["tracking", "Tracked graphic", true], ["censor", "Tracked blur", true], ["screen_replace", "Screen replacement", true], ["cleanup", "Object cleanup", true], ["clone", "Clone person", true], ["parallax", "Parallax", true]].map(([id, label, proxy]) => <DemoButton key={id} id={id} active={demo === id} proxy={proxy} onClick={() => activate(id)}>{label}</DemoButton>)}
        </div>
        <label className="creator-range"><span>Manual horizontal position <b>{Math.round(state.x)}%</b></span><input aria-label="Composite study horizontal position" type="range" min="10" max="90" value={state.x} onChange={event => set({ x: Number(event.target.value) })} /></label>
        <label className="creator-range"><span>Manual vertical position <b>{Math.round(state.y)}%</b></span><input aria-label="Composite study vertical position" type="range" min="12" max="84" value={state.y} onChange={event => set({ y: Number(event.target.value) })} /></label>
        <button type="button" className="creator-linked-tool" onClick={() => onOpenTool("composite")}>Open masks, keys and layer settings →</button>
      </>
    ),
    effects: (
      <>
        <div className="creator-demo-grid is-three">
          <DemoButton id="emoji" active={demo === "emoji"} onClick={() => activate("emoji")}>Emoji</DemoButton>
          <DemoButton id="meme" active={demo === "meme"} onClick={() => activate("meme")}>Meme cutaway</DemoButton>
          <DemoButton id="micro_freeze" active={demo === "micro_freeze"} onClick={() => { activate("micro_freeze"); onFreeze?.(); }}>Micro-freeze</DemoButton>
          <DemoButton id="shake" active={demo === "shake"} onClick={() => activate("shake")}>Impact shake</DemoButton>
          <DemoButton id="stabilization" active={demo === "stabilization"} onClick={() => activate("stabilization")}>Stabilization</DemoButton>
          <DemoButton id="transition" active={demo === "transition"} onClick={() => activate("transition")}>Transition</DemoButton>
          <DemoButton id="beat_sync" timeline active={false} onClick={() => onApplyBeatSync?.()}>Beat sync</DemoButton>
        </div>
        <label className="creator-text-field"><span>Emoji</span><input aria-label="Reaction emoji" value={state.emoji} maxLength={4} onChange={event => set({ emoji: event.target.value })} /></label>
        <label className="creator-range"><span>Graphic position <b>{Math.round(state.x)}% · {Math.round(state.y)}%</b></span><input aria-label="Creator graphic vertical position" type="range" min="12" max="84" value={state.y} onChange={event => set({ y: Number(event.target.value) })} /></label>
        <label className="creator-range"><span>Effect intensity <b>{Math.round(state.intensity)}%</b></span><input aria-label="Creator effect intensity" type="range" min="10" max="100" value={state.intensity} onChange={event => set({ intensity: Number(event.target.value) })} /></label>
        <div className="creator-inline-actions"><button type="button" onClick={onApplySpeedRamp}>Apply smooth speed ramp</button><button type="button" onClick={() => onOpenTool("pacing")}>Edit ramp points</button></div>
      </>
    ),
    assist: (
      <>
        <div className="creator-demo-grid">
          <DemoButton id="director" active={demo === "director"} onClick={() => {
            activate("director", { evidenceText: reviewedTranscriptEvidence });
            onApplyDirectorSuggestion?.(reviewedTranscriptEvidence);
          }}>Context-aware director suggestion</DemoButton>
        </div>
        <div className={`creator-director-receipt ${reviewedTranscriptEvidence ? "is-grounded" : "is-empty"}`}>
          <span>{reviewedTranscriptEvidence ? "Reviewed transcript evidence" : "Evidence required"}</span>
          <strong>{reviewedTranscriptEvidence ? `“${reviewedTranscriptEvidence}”` : "Review a timestamped caption line before accepting an AI visual suggestion."}</strong>
          <small>{reviewedTranscriptEvidence ? "The suggestion may use this exact spoken evidence. Accept, edit or remove it." : "The studio will not invent transcript evidence or claim a suggestion is grounded without it."}</small>
        </div>
        <div className="creator-inline-actions"><button type="button" onClick={onSaveTemplate}>Save creator style</button><button type="button" onClick={() => set({ activeDemo: "" })}>Reject suggestion</button></div>
      </>
    ),
  };

  return (
    <div className="clip-inspector-body creator-workbench" role="tabpanel" data-testid="creator-workbench">
      <div className="inspector-heading-row">
        <div><span className="panel-kicker">Creator effects</span><h4>Build and review on the real source monitor</h4></div>
        <span className={`inspector-status-dot${demo ? " is-ready" : ""}`}>{demo ? "Preview active" : "Choose an effect"}</span>
      </div>
      <div className="creator-preview-contract"><span aria-hidden="true">◉</span><div><strong>Build at the playhead</strong><small>Timeline actions create editable keys, titles and sound. Browser previews are separate studies and must be cleared before export.</small></div></div>
      <div className="creator-section-tabs" role="tablist" aria-label="Creator feature sections">
        {CREATOR_PREVIEW_SECTIONS.map(([id, label]) => <SectionButton key={id} id={id} active={state.section === id} onClick={() => set({ section: id })}>{label}</SectionButton>)}
      </div>
      <section className="creator-section-body" aria-label={`${state.section} creator controls`}>{demoGroups[state.section]}</section>
      <footer className="creator-live-receipt">
        <span>PREVIEW</span>
        <strong>{DEMO_LABELS[state.activeDemo] || "No effect selected"}</strong>
        <small>Editable browser preview state</small>
        <button
          type="button"
          data-testid="creator-clear-preview"
          disabled={!state.activeDemo}
          onClick={() => set({ activeDemo: "" })}
        >
          Clear preview
        </button>
      </footer>
    </div>
  );
}

function SyncedPreviewVideo({ src, time, playing, rate = 1, className = "", style }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;
    const target = Math.max(0, Number(time || 0));
    if (Math.abs(Number(video.currentTime || 0) - target) > 0.12) {
      try { video.currentTime = target; } catch (_) {}
    }
    video.playbackRate = rate;
    if (playing) video.play?.().catch(() => {});
    else video.pause?.();
  }, [playing, rate, src, time]);
  return <video ref={ref} src={src || undefined} muted playsInline preload="auto" tabIndex={-1} aria-hidden="true" className={className} style={style} />;
}

const TrackedStyle = ({ state }) => {
  // Position is reviewed by the editor. Never synthesize a tracking path.
  return { left: `${Number(state.x)}%`, top: `${Number(state.y)}%` };
};

export function getCreatorCanvasClass(value) {
  const state = { ...DEFAULT_CREATOR_PREVIEW, ...(value || {}) };
  if (!state.enabled) return "";
  if (["reaction_punch", "punch_zoom"].includes(state.activeDemo)) return "creator-canvas-punch";
  if (state.activeDemo === "snap_zoom") return "creator-canvas-snap";
  if (state.activeDemo === "crash_zoom") return "creator-canvas-crash";
  if (state.activeDemo === "shake" || state.activeDemo === "beat_sync") return "creator-canvas-shake";
  if (state.activeDemo === "stabilization") return "creator-canvas-stabilized";
  if (state.activeDemo === "parallax") return "creator-canvas-parallax";
  return "";
}

export function StudioCreatorPreviewLayer({
  value,
  source,
  reactionSources = [],
  time,
  playing,
  playbackRate = 1,
}) {
  const state = { ...DEFAULT_CREATOR_PREVIEW, ...(value || {}) };
  const demo = state.activeDemo;
  const trackedStyle = useMemo(() => TrackedStyle({ state, time }), [state, time]);
  if (!state.enabled || !demo) return null;
  const videoProps = { src: source, time, playing, rate: playbackRate };
  const reactionAngles = [...reactionSources, source]
    .filter(Boolean)
    .filter((candidate, index, list) => list.indexOf(candidate) === index)
    .slice(0, 3);

  return (
    <div className={`studio-creator-preview-layer is-${demo}`} data-testid="studio-creator-preview-layer" data-active-demo={demo}>
      {["reaction_freeze", "reaction_punch", "micro_freeze"].includes(demo) ? <div className="creator-freeze-chip"><span>▮▮</span><strong>{demo === "micro_freeze" ? "MICRO HOLD" : "REACTION HOLD"}</strong><small>{Number(state.duration).toFixed(1)}s</small></div> : null}
      {demo === "reaction_montage" ? <div className="creator-reaction-montage">{reactionAngles.map((angle, index) => <div key={angle}><SyncedPreviewVideo {...videoProps} src={angle} style={{ objectPosition: "50% 50%" }} /><span>Source {index + 1}</span></div>)}</div> : null}
      {["instant_replay", "slow_replay"].includes(demo) ? <div className="creator-replay-card"><SyncedPreviewVideo {...videoProps} rate={demo === "slow_replay" ? 0.45 : 1} /><span>↶ {demo === "slow_replay" ? "SLOW REPLAY · 0.45×" : "INSTANT REPLAY"}</span></div> : null}
      {demo === "speaker_intro" ? <div className={`creator-speaker-intro is-${state.introStyle}`}><span>INTRODUCING</span><strong>{state.name}</strong><i /><small>{state.role}</small></div> : null}
      {demo === "contextual_logos" ? <div className="creator-logo-sequence">{state.entity.trim() ? state.entity.split(/[,\n]/).map((label, index) => <span key={index}><b>{label.trim()}</b></span>) : <span>Import your logo in Visual layers</span>}</div> : null}
      {demo === "contextual_number" ? <div className="creator-number-callout" style={trackedStyle}><strong>{state.entity || "Enter your value"}</strong></div> : null}
      {demo === "contextual_screen" ? <div className="creator-ui-insert" style={trackedStyle}><header><span>Screen insert</span></header><main><small>Import a screenshot or screen recording in Visual layers.</small></main></div> : null}
      {["arrow", "circle", "highlight"].includes(demo) ? <svg className={`creator-callout-shape is-${demo}`} viewBox="0 0 100 100" preserveAspectRatio="none" style={{ color: state.color }}><path d={demo === "arrow" ? "M58 58 C69 49 77 40 87 29 M77 30 L88 29 L84 40" : demo === "circle" ? "M55 69 C54 55 83 53 85 68 C87 83 58 85 55 69 Z" : "M13 80 C35 75 59 82 88 74"} /></svg> : null}
      {demo === "kinetic_text" ? <div className="creator-kinetic-title">{String(state.text || "THIS CHANGED EVERYTHING").split(" ").map((word, index) => <span key={`${word}-${index}`} className={index === String(state.text).split(" ").length - 1 ? "is-impact" : ""}>{word}</span>)}</div> : null}
      {demo === "caption_emphasis" ? <div className="creator-caption-emphasis"><strong>{state.text}</strong></div> : null}
      {demo === "emoji" ? <div className="creator-emoji" style={trackedStyle}>{state.emoji}</div> : null}
      {demo === "comparison" ? <div className="creator-comparison"><section><span>OPTION A</span><strong>{state.comparisonLeft}</strong></section><i>VS</i><section><span>OPTION B</span><strong>{state.comparisonRight}</strong></section></div> : null}
      {demo === "ranking" ? <div className="creator-ranking">{state.entity.trim() ? state.entity.split(/[,\n]/).map((label, index) => <p key={index}><b>#{index + 1}</b><strong>{label.trim()}</strong></p>) : <span>Enter your list, separated by commas</span>}</div> : null}
      {demo === "quote" ? <div className="creator-quote"><span>“</span><strong>{state.text}</strong></div> : null}
      {demo === "mask" ? <div className="creator-mask-preview"><SyncedPreviewVideo {...videoProps} /></div> : null}
      {["cutout", "background", "text_behind"].includes(demo) ? <div className={`creator-cutout-scene is-${demo}`}><div className="creator-replacement-background"><i/><i/><i/></div>{demo === "text_behind" ? <strong>{state.text}</strong> : null}<SyncedPreviewVideo {...videoProps} className="creator-cutout-foreground" /><span>SUBJECT MATTE · PREVIEW PROXY</span></div> : null}
      {demo === "tracking" ? <div className="creator-tracked-label" style={trackedStyle}><i>+</i><strong>{state.entity}</strong><small>MANUAL POSITION · NO TRACKING DATA</small></div> : null}
      {demo === "censor" ? <div className="creator-censor" style={trackedStyle}><span>PRIVACY BLUR</span></div> : null}
      {demo === "screen_replace" ? <div className="creator-screen-replacement"><div><small>Supply your replacement media</small></div><i>FOUR-CORNER PREVIEW PROXY</i></div> : null}
      {demo === "cleanup" ? <div className="creator-cleanup-patch" style={trackedStyle}><span>PLACEMENT STUDY · NO OBJECT REMOVED</span></div> : null}
      {demo === "clone" ? <div className="creator-clone-scene">{["left", "center", "right"].map(position => <SyncedPreviewVideo key={position} {...videoProps} className={`is-${position}`} />)}<span>3 × SOURCE · SAME TIMECODE</span></div> : null}
      {demo === "parallax" ? <div className="creator-parallax-scene"><i className="is-far"/><i className="is-mid"/><i className="is-near"/><strong>3D DEPTH PLANES</strong><span>PARALLAX · PREVIEW PROXY</span></div> : null}
      {demo === "meme" ? <div className="creator-meme-card"><span>POV:</span><strong>THE CLIENT SAYS<br/>“ONE SMALL CHANGE”</strong><i>{state.emoji}</i><small>USER-SUPPLIED / RIGHTS-SAFE INSERT</small></div> : null}
      {demo === "transition" ? <div className={`creator-transition is-${state.transition}`}><span>{state.transition.toUpperCase()} TRANSITION</span></div> : null}
      {demo === "beat_sync" ? <div className="creator-beat-impact"><i/><i/><strong>BEAT</strong></div> : null}
      {demo === "stabilization" ? <div className="creator-stabilization-guide"><span>STABILIZED PREVIEW</span><i/><i/><i/></div> : null}
      {demo === "layer_stack" ? <div className="creator-layer-stack"><div className="layer-screen">APP UI</div><div className="layer-title">BUILD WHAT MATTERS</div><div className="layer-logo">A</div><div className="layer-arrow">➜</div><div className="layer-emoji">🔥</div><div className="layer-camera"><SyncedPreviewVideo {...videoProps}/></div><span>7 ACTIVE VISUAL LAYERS</span></div> : null}
    </div>
  );
}
