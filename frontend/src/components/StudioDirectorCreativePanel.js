import React, { useEffect, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { compileDirectorCreativePlan } from "./studioDirectorCreativePlan";
import { measureDirectorSources } from "./studioDirectorComposition";
import { directorNodeContext } from "./studioDirectorNodePlan";
import StudioDirectorFragmentControls from "./StudioDirectorFragmentControls";
import StudioDirectorPosterControls from "./StudioDirectorPosterControls";
import { directorPosterContext } from "./studioDirectorPosterPlan";
import {
  studioCreativePlannerStatus,
  requestStudioCreativePlan,
  reviseDirectorFragment,
  reviseDirectorPoster,
} from "./studioDirectorCreativeClient";

export default function StudioDirectorCreativePanel({
  getSnapshot,
  onApply,
  onOpenNodes,
  locked = false,
}) {
  const [brief, setBrief] = useState(""),
    [duration, setDuration] = useState(12),
    [available, setAvailable] = useState(null),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(null),
    [message, setMessage] = useState(""),
    [operatorDirty, setOperatorDirty] = useState(false);
  const [approach, setApproach] = useState("poster");
  const request = useRef(null),
    mounted = useRef(true),
    latest = useRef({ getSnapshot, onApply });
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
    setMessage("");
  };
  async function plan() {
    setBusy(true);
    setReview(null);
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
        approach === "poster"
          ? directorPosterContext(snapshot, brief, Number(duration))
          : await measureDirectorSources(
              directorNodeContext(snapshot, brief, Number(duration)),
              snapshot,
              controller.signal
            );
      const token = await user.getIdToken(),
        result = await requestStudioCreativePlan(context, token, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (getAuth().currentUser?.uid !== user.uid)
        throw Error("Your sign-in changed. Ask for a new plan.");
      const next = latest.current.getSnapshot();
      if (
        next.studioDocument.projectId !== context.projectId ||
        next.studioDocument.revision !== context.baseRevision
      )
        throw Error("The project changed while planning. Ask for a new plan.");
      const compiled = compileDirectorCreativePlan(result, next);
      setReview({ ...compiled, result, reviewerUid: user.uid });
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
  async function apply() {
    setBusy(true);
    try {
      if (getAuth().currentUser?.uid !== review.reviewerUid)
        throw Error("Your sign-in changed. Ask for a new plan.");
      // Recompile against the current document, not the snapshot from the model request.
      const fresh = compileDirectorCreativePlan(review.result, latest.current.getSnapshot());
      await latest.current.onApply(fresh.plan);
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
  async function updateFragment(fragment) {
    setBusy(true);
    try {
      if (getAuth().currentUser?.uid !== review.reviewerUid)
        throw Error("Your sign-in changed. Ask for a new plan.");
      const result = await reviseDirectorFragment(review.result, fragment);
      const compiled = compileDirectorCreativePlan(result, latest.current.getSnapshot());
      if (!mounted.current) return;
      setReview({ ...compiled, result, reviewerUid: review.reviewerUid });
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
      if (getAuth().currentUser?.uid !== review.reviewerUid)
        throw Error("Your sign-in changed. Ask for a new plan.");
      const result = await reviseDirectorPoster(review.result, poster);
      const compiled = compileDirectorCreativePlan(result, latest.current.getSnapshot());
      if (!mounted.current) return;
      setReview({ ...compiled, result, reviewerUid: review.reviewerUid });
      setOperatorDirty(false);
      setMessage("Motion design updated. Review and apply the revised edit.");
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
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
        <button
          className="studio-director-create"
          type="button"
          onClick={plan}
          disabled={busy || locked || available !== true || !brief.trim()}
        >
          {busy ? "Directing…" : "Create my motion edit"}
        </button>
      </div>
      <p className="studio-director-creative__context">
        {approach === "poster"
          ? "Builds a designed type-and-shape sequence with editable vector letters, construction masks, stroke motion and a camera lockup. Director chooses copy, palette and energy within this authored design."
          : "Builds editable footage fragments and controller connections. Samples clip colours and frame changes; subject recognition and audio analysis are not included."}
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
