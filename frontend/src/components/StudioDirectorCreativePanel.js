import React, { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { compileDirectorCreativePlan } from "./studioDirectorCreativePlan";
import { buildDirectorCinema3DProposal, directorCinema3DContext } from "./studioDirector3DPlan";
import {
  DIRECTOR_CHOREOGRAPHY_ARCHETYPES,
  DIRECTOR_CINEMA_LOOK_PROFILES,
  analyzeDirectorClipTelemetry,
  buildDirectorFinishGradeAction,
  buildSourceBoundDirectorProposal,
  directorCompositionContext,
  measureDirectorSources,
} from "./studioDirectorComposition";
import { directorNodeContext } from "./studioDirectorNodePlan";
import { directorPosterContext } from "./studioDirectorPosterPlan";
import {
  requestStudioCreativePlan,
  reviseDirectorFragment,
  reviseDirectorPoster,
  studioCreativePlannerStatus,
} from "./studioDirectorCreativeClient";
import StudioDirectorFragmentControls from "./StudioDirectorFragmentControls";
import StudioDirectorPosterControls from "./StudioDirectorPosterControls";

export const DIRECTOR_BRIEF_TEMPLATES = [
  {
    id: "kinetic_opener",
    label: "Kinetic Broadcast Opener",
    approach: "poster",
    lookId: "teal_orange",
    brief:
      "High-energy kinetic broadcast opener with bold geometric typography, vector trim strokes and an emblem lockup.",
  },
  {
    id: "fragment_reveal",
    label: "Fragmented City Reveal",
    approach: "fragments",
    lookId: "kodak_2383",
    brief:
      "Cut through the opening street scene into moving vertical fragments that fan open and rebuild into the second clip.",
  },
  {
    id: "cyber_portal",
    label: "Cyberpunk Portal & Whip Pan",
    approach: "composition",
    lookId: "neon_cyber",
    archetypeId: "portal_prism",
    brief:
      "Neon cyberpunk portal reveal anchored on the moving subject with camera rig whip pan, rotoscope prism and beat-synced grade pulses.",
  },
  {
    id: "kodak_weave",
    label: "Kodak 2383 Split Diptych",
    approach: "composition",
    lookId: "kodak_2383",
    archetypeId: "split_diptych",
    brief:
      "Warm Kodak 2383 cinema film print with architectural split diptych, soft-feathered rotoscope mask and golden halation.",
  },
  {
    id: "brand_3d_vfx",
    label: "3D Brand VFX Reveal",
    approach: "cinema_3d",
    lookId: "teal_orange",
    brief:
      "Direct a molten-gold and cyan WebGL2 3D brand reveal for 'APEX NOVA' with vortex particles and optical floor shockwave.",
  },
  {
    id: "ribbon_sculpture_3d",
    label: "3D Ribbon Sculpture Stage",
    approach: "cinema_3d",
    lookId: "ultraviolet_pulse",
    brief:
      "Choreograph a 3D iridescent morphing ribbon sculpture and refractive crystal core under studio sculpture lighting.",
  },
  {
    id: "audio_spectrum_3d",
    label: "3D Audio Spectrum Lyric",
    approach: "cinema_3d",
    lookId: "neon_cyber",
    brief:
      "Build an audio-reactive 3D chrome title stage 'SONIC HORIZON' with glowing crystal spectrum pylons and beat LUT pulses.",
  },
  {
    id: "hybrid_3d_film",
    label: "Full-Stack Hybrid Film + 3D",
    approach: "cinema_3d",
    lookId: "kodak_2383",
    archetypeId: "split_diptych",
    brief:
      "Direct a hybrid split-diptych video film with Kodak 2383 LUT, 3D glass lower-third callout, and closing 3D brand reveal.",
  },
  {
    id: "omniscient_masterpiece",
    label: "8-Track Omniscient Masterpiece",
    approach: "cinema_3d",
    lookId: "teal_orange",
    archetypeId: "omniscient_showpiece",
    brief:
      "Direct an 8-track omniscient studio masterpiece for 'APEX NOVA': revive dead footage, isolate skin radiance with a subject spotlight power window, open a circle B-roll portal with voice-first ducking, trace a vector target reticle HUD, animate an elastic wave kinetic headline, and close with a 3D brand reveal.",
  },
  {
    id: "revive_selective_broll",
    label: "Revive Dead Clip + B-Roll Portal",
    approach: "composition",
    lookId: "kodak_2383",
    archetypeId: "broll_cutaway_rig",
    brief:
      "Revive flat low-light footage, apply crimson garment selective HSL splash and face spotlight window, cut in a circle B-roll portal with voice-first audio ducking, and animate a kinetic callout.",
  },
];

function summarizePlanTopology(compiled, forceRecompute = false) {
  const actions = compiled?.plan?.actions || [];
  const finishAction = actions.find(a => a.type === "finish_grade");
  const finishSummary = finishAction
    ? {
        id: finishAction.advancedColor?.lutPresetId || "custom",
        label: finishAction.name || "Cinema Grade",
        beatSyncPulses: Boolean(finishAction.beatSyncPulses),
        ...(finishAction.grade?.revitalizerPresetId
          ? { revitalizerPresetId: finishAction.grade.revitalizerPresetId }
          : {}),
        ...(finishAction.advancedColor?.qualifierPresetId
          ? { qualifierPresetId: finishAction.advancedColor.qualifierPresetId }
          : {}),
        ...(finishAction.advancedColor?.powerWindowPresetId
          ? { powerWindowPresetId: finishAction.advancedColor.powerWindowPresetId }
          : {}),
      }
    : null;
  if (compiled.topologySummary && !forceRecompute) {
    return {
      ...compiled.topologySummary,
      colorGrade: finishSummary || compiled.topologySummary.colorGrade || null,
    };
  }
  return {
    videoLayers: actions.filter(a => a.type === "media_plane").length,
    threeDScenes: actions.filter(a => a.type === "three_d_scene").length,
    nullRigs: actions.filter(a => a.type === "null").length,
    shapeLayers: compiled?.plan?.graphics?.layers?.length || 0,
    kineticTitles: actions.filter(
      a => a.type === "title" && Boolean(a.textAnimatorPreset || a.textAnimator)
    ).length,
    vectorPrimitives: (compiled?.plan?.graphics?.layers || []).filter(l =>
      Boolean(l.vectorShape)
    ).length,
    bRollCutaways: actions.filter(a => a.type === "media_plane" && Boolean(a.bRollLayoutPreset))
      .length,
    parentLinks: actions.filter(
      a => a.type === "parent" || (a.type === "node_connect" && a.port === "Parent")
    ).length,
    trackMattes: actions.filter(
      a => a.type === "matte" || (a.type === "node_connect" && a.port === "Mask")
    ).length,
    softMasks: actions.filter(a => a.type === "media_plane" && Number(a.mask?.feather) > 0).length,
    motionDrivers: actions.filter(
      a =>
        a.type === "motion_driver" ||
        (a.motionDrivers && Object.keys(a.motionDrivers).length > 0)
    ).length,
    animatedMaskKeys: actions
      .filter(a => a.type === "keys")
      .reduce(
        (sum, a) =>
          sum + (a.keys || []).filter(k => /^maskPoint\d+[XY]$/.test(k.property)).length,
        0
      ),
    colorGrade: finishSummary,
  };
}

export default function StudioDirectorCreativePanel({
  getSnapshot,
  onApply,
  onOpenNodes,
  locked = false,
}) {
  const [brief, setBrief] = useState("");
  const [duration, setDuration] = useState(12);
  const [approach, setApproach] = useState("poster");
  const [lookId, setLookId] = useState("auto");
  const [archetypeId, setArchetypeId] = useState("auto");
  const [beatSyncPulses, setBeatSyncPulses] = useState(true);
  const [available, setAvailable] = useState(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [operatorDirty, setOperatorDirty] = useState(false);
  const [message, setMessage] = useState("");
  const request = useRef(null);
  const mounted = useRef(true);
  const latest = useRef({ getSnapshot, onApply });
  latest.current = { getSnapshot, onApply };

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    (async () => {
      try {
        const user = getAuth().currentUser;
        if (!user) return setAvailable(false);
        const token = await user.getIdToken();
        const status = await studioCreativePlannerStatus(token, controller.signal);
        if (!controller.signal.aborted) setAvailable(status.available === true);
      } catch {
        if (!controller.signal.aborted) setAvailable(false);
      }
    })();
    return () => {
      mounted.current = false;
      controller.abort();
      request.current?.abort();
    };
  }, []);

  const change = setter => e => {
    setter(e.target.value);
    setReview(null);
    setOperatorDirty(false);
    setMessage("");
  };

  const applyBriefTemplate = template => {
    setBrief(template.brief);
    if (template.approach) setApproach(template.approach);
    if (template.lookId) setLookId(template.lookId);
    if (template.archetypeId) setArchetypeId(template.archetypeId);
    setReview(null);
    setOperatorDirty(false);
    setMessage("");
  };

  async function plan() {
    setBusy(true);
    setReview(null);
    setOperatorDirty(false);
    setMessage("The Director is choosing shots and choreographing the motion…");
    const controller = new AbortController();
    request.current = controller;
    try {
      const user = getAuth().currentUser;
      if (!user) throw Error("Sign in before asking the Director.");
      const snapshot = latest.current.getSnapshot();
      setMessage(
        approach === "poster"
          ? "Planning the wording, palette and energy for the motion design…"
          : "Inspecting saved clip colours and motion, then planning the composition…"
      );
      const context =
        approach === "cinema_3d"
          ? directorCinema3DContext(snapshot, brief, Number(duration))
          : approach === "poster"
            ? directorPosterContext(snapshot, brief, Number(duration))
            : approach === "fragments"
              ? await measureDirectorSources(
                  directorNodeContext(snapshot, brief, Number(duration)),
                  snapshot,
                  controller.signal
                )
              : await measureDirectorSources(
                  directorCompositionContext(snapshot, brief, Number(duration)),
                  snapshot,
                  controller.signal
                );
      const token = await user.getIdToken();
      const result = await requestStudioCreativePlan(context, token, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (getAuth().currentUser?.uid !== user.uid) {
        throw Error("Your sign-in changed. Ask for a new plan.");
      }
      const next = latest.current.getSnapshot();
      if (
        next.studioDocument.projectId !== context.projectId ||
        next.studioDocument.revision !== context.baseRevision
      ) {
        throw Error("The project changed while planning. Ask for a new plan.");
      }
      const compiled = compileDirectorCreativePlan(result, next);
      const telemetry =
        context.pixelEvidence && Array.isArray(context.media)
          ? analyzeDirectorClipTelemetry(context)
          : null;
      setReview({
        ...compiled,
        topologySummary: summarizePlanTopology(compiled),
        telemetry,
        result,
        reviewerUid: user.uid,
      });
      setOperatorDirty(false);
      setMessage("Review the shots below, then apply the motion to your editable timeline.");
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setMessage(error.message);
    } finally {
      if (mounted.current) {
        setBusy(false);
        request.current = null;
      }
    }
  }

  async function choreographSourceGraph() {
    setBusy(true);
    setReview(null);
    setOperatorDirty(false);
    setMessage(
      approach === "cinema_3d"
        ? "Choreographing WebGL2 3D VFX stages, lighting, and colour grades…"
        : "Sampling source colour scopes and motion centroids for Cinema Graph…"
    );
    const controller = new AbortController();
    request.current = controller;
    try {
      const user = getAuth().currentUser;
      if (!user) throw Error("Sign in before asking the Director.");
      const snapshot = latest.current.getSnapshot();
      const baseContext =
        approach === "cinema_3d"
          ? directorCinema3DContext(snapshot, brief, Number(duration))
          : directorCompositionContext(snapshot, brief, Number(duration));
      let measuredEvidence = null;
      if (baseContext.media.length > 0) {
        try {
          const measured = await measureDirectorSources(baseContext, snapshot, controller.signal);
          measuredEvidence = measured?.pixelEvidence || null;
        } catch {
          measuredEvidence = null;
        }
      }
      if (!mounted.current || controller.signal.aborted) return;
      if (getAuth().currentUser?.uid !== user.uid) {
        throw Error("Your sign-in changed. Ask for a new plan.");
      }
      const next = latest.current.getSnapshot();
      if (
        next.studioDocument.projectId !== baseContext.projectId ||
        next.studioDocument.revision !== baseContext.baseRevision
      ) {
        throw Error("The project changed while planning. Ask for a new plan.");
      }
      const result =
        approach === "cinema_3d"
          ? buildDirectorCinema3DProposal(next, brief, Number(duration), {
              lookId,
              archetypeId,
              beatSyncPulses,
              pixelEvidence: measuredEvidence,
            })
          : buildSourceBoundDirectorProposal(next, brief, Number(duration), {
              lookId,
              archetypeId,
              beatSyncPulses,
              pixelEvidence: measuredEvidence,
            });
      const compiled = compileDirectorCreativePlan(result, next);
      const telemetry = analyzeDirectorClipTelemetry({
        ...baseContext,
        pixelEvidence: result.provenance?.pixelEvidence || measuredEvidence || [],
      });
      setReview({
        ...compiled,
        topologySummary: summarizePlanTopology(compiled),
        telemetry,
        result,
        reviewerUid: user.uid,
      });
      setMessage("Review the shots below, then apply the motion to your editable timeline.");
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setMessage(error.message);
    } finally {
      if (mounted.current) {
        setBusy(false);
        request.current = null;
      }
    }
  }

  async function updateFragment(fragment) {
    setBusy(true);
    try {
      if (getAuth().currentUser?.uid !== review.reviewerUid) {
        throw Error("Your sign-in changed. Ask for a new plan.");
      }
      const result = await reviseDirectorFragment(review.result, fragment);
      const compiled = compileDirectorCreativePlan(result, latest.current.getSnapshot());
      if (!mounted.current) return;
      setReview({
        ...compiled,
        topologySummary: summarizePlanTopology(compiled),
        telemetry: review.telemetry || null,
        customFinishGrade: review.customFinishGrade || null,
        result,
        reviewerUid: review.reviewerUid,
      });
      setOperatorDirty(false);
      setMessage("Motion settings updated. Review and apply the revised edit.");
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function updatePoster(poster) {
    setBusy(true);
    try {
      if (getAuth().currentUser?.uid !== review.reviewerUid) {
        throw Error("Your sign-in changed. Ask for a new plan.");
      }
      const result = await reviseDirectorPoster(review.result, poster);
      const compiled = compileDirectorCreativePlan(result, latest.current.getSnapshot());
      if (!mounted.current) return;
      setReview({
        ...compiled,
        topologySummary: summarizePlanTopology(compiled),
        telemetry: review.telemetry || null,
        customFinishGrade: review.customFinishGrade || null,
        result,
        reviewerUid: review.reviewerUid,
      });
      setOperatorDirty(false);
      setMessage("Motion design updated. Review and apply the revised edit.");
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  function bindFinishGradeToReview() {
    if (!review) return;
    const resolvedLook =
      lookId && lookId !== "auto" && DIRECTOR_CINEMA_LOOK_PROFILES[lookId]
        ? lookId
        : review.telemetry?.[0]?.suggestedLookId || "kodak_2383";
    const gradeAction = buildDirectorFinishGradeAction(resolvedLook, {
      duration: Number(duration) || 12,
      beatSyncPulses,
    });
    const filteredActions = review.plan.actions.filter(a => a.type !== "finish_grade");
    if (filteredActions.length >= 64) {
      setMessage("Scene action budget is full (64 actions); apply as-is or simplify the plan.");
      return;
    }
    const nextPlan = {
      ...review.plan,
      actions: [...filteredActions, gradeAction],
    };
    const nextReview = {
      ...review,
      plan: nextPlan,
      customFinishGrade: gradeAction,
    };
    nextReview.topologySummary = summarizePlanTopology(nextReview);
    setReview(nextReview);
    setMessage(
      `Bound ${gradeAction.name} 3D LUT${beatSyncPulses ? " + Beat-Synced Grade Pulses" : ""} to the reviewed plan.`
    );
  }

  async function apply() {
    setBusy(true);
    try {
      if (getAuth().currentUser?.uid !== review.reviewerUid) {
        throw Error("Your sign-in changed. Ask for a new plan.");
      }
      // Recompile against the current document, not the snapshot from the model request.
      const fresh = compileDirectorCreativePlan(review.result, latest.current.getSnapshot());
      const finalPlan =
        review.customFinishGrade &&
        !fresh.plan.actions.some(a => a.type === "finish_grade") &&
        fresh.plan.actions.length < 64
          ? {
              ...fresh.plan,
              actions: [...fresh.plan.actions, review.customFinishGrade],
            }
          : fresh.plan;
      await latest.current.onApply(finalPlan);
      if ([3, 4].includes(review.result.version)) onOpenNodes?.();
      if (mounted.current) {
        setReview(null);
        setMessage(
          "Director edit applied. Every layer and motion key is editable; Undo restores your previous edit."
        );
      }
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  const totalReviewDuration = Math.max(
    1,
    Number(review?.result?.duration || duration || 12)
  );

  return (
    <section
      className="studio-director-creative"
      aria-label="Director motion edit"
      data-testid="studio-director-creative"
    >
      <div className="studio-director-creative__intro">
        <span className="panel-kicker">AI Director</span>
        <h4>Describe it. Direct the result.</h4>
        <p>
          Let the Director choose clips, arrange scenes and build the motion. Review the plan before
          it changes your timeline.
        </p>
      </div>
      <div
        className="studio-director-preset-pills"
        data-testid="director-brief-presets"
        aria-label="Director brief templates"
      >
        {DIRECTOR_BRIEF_TEMPLATES.map(template => (
          <button
            key={template.id}
            type="button"
            className="studio-director-preset-pill"
            data-testid={`director-brief-preset-${template.id}`}
            disabled={busy}
            onClick={() => applyBriefTemplate(template)}
          >
            {template.label}
          </button>
        ))}
      </div>
      <label>
        Design approach
        <select
          aria-label="Director design approach"
          value={approach}
          disabled={busy}
          onChange={change(setApproach)}
        >
          <option value="poster">Kinetic motion graphics</option>
          <option value="fragments">Footage fragments</option>
          <option value="composition">Cinema composition graph</option>
          <option value="cinema_3d">Cinema 3D VFX + Studio Stage</option>
        </select>
      </label>
      <label>
        Your creative brief
        <textarea
          aria-label="Director creative brief"
          maxLength={1200}
          rows={4}
          value={brief}
          onChange={change(setBrief)}
          disabled={busy}
          placeholder={
            approach === "poster"
              ? "MAKE IT MOVE. Cream, orange and lime. Bold letter construction and energetic motion."
              : "A wordless film where the city opens into the sea. Bold colour and a connected reveal."
          }
        />
      </label>
      <div className="studio-director-creative__controls">
        <label>
          Duration
          <input
            aria-label="Director edit duration"
            type="number"
            min={approach === "poster" ? "8" : "2"}
            max={approach === "poster" ? "20" : "30"}
            step="1"
            value={duration}
            onChange={change(setDuration)}
            disabled={busy}
          />
          <span>seconds, within the current project</span>
        </label>
        <label>
          Cinema Grade &amp; 3D LUT
          <select
            aria-label="Director cinema look"
            data-testid="director-look-select"
            value={lookId}
            onChange={change(setLookId)}
            disabled={busy}
          >
            <option value="auto">Auto (From Clip Scopes &amp; Brief)</option>
            {Object.values(DIRECTOR_CINEMA_LOOK_PROFILES).map(profile => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Choreography Archetype
          <select
            aria-label="Director choreography archetype"
            data-testid="director-archetype-select"
            value={archetypeId}
            onChange={change(setArchetypeId)}
            disabled={busy}
          >
            <option value="auto">Auto (From Brief &amp; Focal Centroid)</option>
            {Object.values(DIRECTOR_CHOREOGRAPHY_ARCHETYPES).map(arch => (
              <option key={arch.id} value={arch.id}>
                {arch.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inspector-check-row">
          <input
            type="checkbox"
            data-testid="director-beat-pulses-toggle"
            checked={beatSyncPulses}
            onChange={e => {
              setBeatSyncPulses(e.target.checked);
              setReview(null);
            }}
            disabled={busy}
          />
          <span>Beat-Synced Grade Pulses</span>
        </label>
        <button
          className="studio-director-create"
          type="button"
          onClick={plan}
          disabled={busy || locked || available !== true || !brief.trim()}
        >
          {busy ? "Directing…" : "Create my motion edit"}
        </button>
        <button
          type="button"
          className="studio-director-choreograph"
          data-testid="director-choreograph-btn"
          onClick={choreographSourceGraph}
          disabled={busy || locked || !brief.trim()}
        >
          Choreograph Source-Bound Cinema Graph
        </button>
      </div>
      <p className="studio-director-creative__context">
        {approach === "poster"
          ? "Builds a designed type-and-shape sequence with editable vector letters, construction masks, stroke motion and a camera lockup. Director chooses copy, palette and energy within this authored design."
          : approach === "cinema_3d"
            ? "Directs real-time WebGL2 3D VFX scenes (extruded Inter 900 brand logos, morphing parametric ribbons, 22-band crystal audio spectrums, smoked-glass HUD cards) plus optional source footage rotoscope & 3D LUT grades."
            : "Builds editable footage fragments, Null Rigs, Motion Drivers, and 3D LUT Color Grades. Samples clip colours and frame changes."}
      </p>
      {available === false ? (
        <p role="status">Director planning is not enabled in this environment.</p>
      ) : null}
      {review ? (
        <div className="studio-director-creative__review" aria-label="Director storyboard">
          <h5>{review.plan.name}</h5>
          {review.concept ? <p>{review.concept}</p> : null}
          {review.nodeSummary ? (
            <p>
              {review.nodeSummary.nodes} nodes · {review.nodeSummary.connections} connections ·{" "}
              {review.nodeSummary.drivers} motion drivers
            </p>
          ) : null}
          {review.topologySummary ? (
            <div
              className="studio-director-creative__topology"
              data-testid="director-topology-summary"
            >
              <span>Rigs: {review.topologySummary.nullRigs}</span>
              <span>Mattes: {review.topologySummary.trackMattes}</span>
              <span>Soft Masks: {review.topologySummary.softMasks}</span>
              <span>Drivers: {review.topologySummary.motionDrivers}</span>
              <span>Mask Keys: {review.topologySummary.animatedMaskKeys}</span>
              {review.topologySummary.threeDScenes > 0 ? (
                <span>3D Scenes: {review.topologySummary.threeDScenes}</span>
              ) : null}
              {review.topologySummary.kineticTitles > 0 ? (
                <span>Kinetic Titles: {review.topologySummary.kineticTitles}</span>
              ) : null}
              {review.topologySummary.vectorPrimitives > 0 ? (
                <span>Vector HUDs: {review.topologySummary.vectorPrimitives}</span>
              ) : null}
              {review.topologySummary.bRollCutaways > 0 ? (
                <span>B-Roll Portals: {review.topologySummary.bRollCutaways}</span>
              ) : null}
              {review.topologySummary.colorGrade ? (
                <span>Look: {review.topologySummary.colorGrade.label}</span>
              ) : null}
              {review.topologySummary.colorGrade?.revitalizerPresetId ? (
                <span>Revival: {review.topologySummary.colorGrade.revitalizerPresetId}</span>
              ) : null}
              {review.topologySummary.colorGrade?.qualifierPresetId ? (
                <span>Selective HSL: {review.topologySummary.colorGrade.qualifierPresetId}</span>
              ) : null}
              {review.topologySummary.colorGrade?.powerWindowPresetId ? (
                <span>Power Window: {review.topologySummary.colorGrade.powerWindowPresetId}</span>
              ) : null}
            </div>
          ) : null}
          {review.shots?.length ? (
            <div
              className="studio-director-creative__timeline-bar"
              data-testid="director-visual-timeline"
              aria-label="Director visual timeline"
            >
              {review.shots.map((shot, idx) => {
                const startPct = Math.max(
                  0,
                  Math.min(100, (shot.startTime / totalReviewDuration) * 100)
                );
                const widthPct = Math.max(
                  6,
                  Math.min(
                    100 - startPct,
                    ((shot.endTime - shot.startTime) / totalReviewDuration) * 100
                  )
                );
                return (
                  <div
                    key={idx}
                    className="studio-director-creative__timeline-segment"
                    style={{
                      left: `${startPct.toFixed(1)}%`,
                      width: `${widthPct.toFixed(1)}%`,
                    }}
                    title={`${shot.sourceName} · ${shot.treatment} (${shot.startTime.toFixed(1)}–${shot.endTime.toFixed(1)}s)`}
                  >
                    <strong>{shot.sourceName}</strong>
                    <span>
                      {shot.startTime.toFixed(1)}–{shot.endTime.toFixed(1)}s
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}
          {review.telemetry?.length ? (
            <div
              className="studio-director-creative__telemetry"
              data-testid="director-telemetry-strip"
            >
              {review.telemetry.map(item => (
                <div key={item.id} className="studio-director-creative__telemetry-card">
                  <span
                    className="studio-director-creative__swatch"
                    style={{
                      backgroundColor: `rgb(${(item.meanRgb || [118, 102, 88]).join(",")})`,
                    }}
                  />
                  <strong>{item.name}</strong>
                  <span>Luma {item.avgLumaIre} IRE</span>
                  <span>Chroma {item.peakChroma}</span>
                  <span>Entropy {item.tonalEntropy}</span>
                  <span>
                    Focal ({item.focalCentroid?.[0] ?? 50}%, {item.focalCentroid?.[1] ?? 48}%)
                  </span>
                  <span>Salience {item.salienceScore}</span>
                </div>
              ))}
            </div>
          ) : null}
          {review.result.provenance?.fragmentIntent ? (
            <StudioDirectorFragmentControls
              value={review.result.provenance.fragmentIntent}
              duration={review.result.duration}
              disabled={busy || locked}
              onDraftChange={() => setOperatorDirty(true)}
              onUpdate={updateFragment}
            />
          ) : null}
          {review.result.version === 4 ? (
            <StudioDirectorPosterControls
              value={review.result.poster}
              disabled={busy || locked}
              onDraftChange={() => setOperatorDirty(true)}
              onUpdate={updatePoster}
            />
          ) : null}
          <div
            className="studio-director-creative__grade-bar"
            data-testid="director-finish-grade-bar"
          >
            <button
              type="button"
              className="studio-director-preset-pill"
              data-testid="director-bind-grade-btn"
              disabled={busy || locked}
              onClick={bindFinishGradeToReview}
            >
              Bind 3D LUT Finish Grade to Plan
            </button>
          </div>
          <details open={!review.result.provenance?.fragmentIntent}>
            <summary>
              {review.result.version === 4 ? "Motion design sequence" : "Generated footage layers"}
            </summary>
            <ol>
              {review.shots.map((shot, i) => (
                <li key={i}>
                  <span>
                    {shot.startTime.toFixed(1)}–{shot.endTime.toFixed(1)}s
                  </span>
                  <strong>{shot.sourceName}</strong>
                  <b>{shot.treatment.replace(/_/g, " ")}</b>
                  <p>{shot.reason}</p>
                </li>
              ))}
            </ol>
          </details>
          <p>
            {review.result.version === 4
              ? `${review.plan.graphics.layers.length} editable graphic layers`
              : review.result.version === 5
                ? `${review.plan.actions.filter(a => a.type === "three_d_scene").length} editable 3D scenes · ${review.plan.actions.filter(a => a.type === "media_plane").length} video layers`
                : `${review.plan.actions.filter(a => a.type === "media_plane").length} editable video layers`}
            ·{" "}
            {review.plan.actions
              .filter(a => a.type === "keys")
              .reduce((n, a) => n + a.keys.length, 0) +
              (review.plan.graphics?.layers || []).reduce((n, l) => n + l.keys.length, 0)}{" "}
            motion keys
          </p>
          <div className="studio-director-creative__actions">
            <button
              className="studio-director-create"
              type="button"
              disabled={busy || locked || operatorDirty}
              onClick={apply}
            >
              Apply Director edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setOperatorDirty(false);
                setMessage("Plan discarded. Your timeline is unchanged.");
              }}
            >
              Discard plan
            </button>
          </div>
        </div>
      ) : null}
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
    </section>
  );
}
