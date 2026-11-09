import React, { useEffect, useRef, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { compileDirectorCreativePlan } from './studioDirectorCreativePlan';
import {
  DIRECTOR_CINEMA_LOOK_PROFILES,
  buildSourceBoundDirectorProposal,
  directorCompositionContext,
  measureDirectorSources,
} from './studioDirectorComposition';
import {
  requestStudioCreativePlan,
  studioCreativePlannerStatus,
} from './studioDirectorCreativeClient';

export default function StudioDirectorCreativePanel({
  getSnapshot,
  onApply,
  locked = false,
}) {
  const [brief, setBrief] = useState('');
  const [duration, setDuration] = useState(12);
  const [lookId, setLookId] = useState('auto');
  const [beatSyncPulses, setBeatSyncPulses] = useState(true);
  const [available, setAvailable] = useState(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(null);
  const [message, setMessage] = useState('');
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
    setMessage('');
  };

  async function plan() {
    setBusy(true);
    setReview(null);
    setMessage('The Director is choosing shots and choreographing the motion…');
    const controller = new AbortController();
    request.current = controller;
    try {
      const user = getAuth().currentUser;
      if (!user) throw Error('Sign in before asking the Director.');
      const snapshot = latest.current.getSnapshot();
      setMessage('Inspecting saved clip colours and motion, then planning the composition…');
      const context = await measureDirectorSources(
        directorCompositionContext(snapshot, brief, Number(duration)),
        snapshot,
        controller.signal
      );
      const token = await user.getIdToken();
      const result = await requestStudioCreativePlan(context, token, controller.signal);
      if (!mounted.current || controller.signal.aborted) return;
      if (getAuth().currentUser?.uid !== user.uid) {
        throw Error('Your sign-in changed. Ask for a new plan.');
      }
      const next = latest.current.getSnapshot();
      if (
        next.studioDocument.projectId !== context.projectId ||
        next.studioDocument.revision !== context.baseRevision
      ) {
        throw Error('The project changed while planning. Ask for a new plan.');
      }
      const compiled = compileDirectorCreativePlan(result, next);
      setReview({ ...compiled, result, reviewerUid: user.uid });
      setMessage('Review the shots below, then apply the motion to your editable timeline.');
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
    setMessage('Sampling source colour scopes and motion centroids for Cinema Graph…');
    const controller = new AbortController();
    request.current = controller;
    try {
      const user = getAuth().currentUser;
      if (!user) throw Error('Sign in before asking the Director.');
      const snapshot = latest.current.getSnapshot();
      const baseContext = directorCompositionContext(snapshot, brief, Number(duration));
      let measuredEvidence = null;
      try {
        const measured = await measureDirectorSources(baseContext, snapshot, controller.signal);
        measuredEvidence = measured?.pixelEvidence || null;
      } catch {
        measuredEvidence = null;
      }
      if (!mounted.current || controller.signal.aborted) return;
      if (getAuth().currentUser?.uid !== user.uid) {
        throw Error('Your sign-in changed. Ask for a new plan.');
      }
      const next = latest.current.getSnapshot();
      if (
        next.studioDocument.projectId !== baseContext.projectId ||
        next.studioDocument.revision !== baseContext.baseRevision
      ) {
        throw Error('The project changed while planning. Ask for a new plan.');
      }
      const result = await buildSourceBoundDirectorProposal(
        next,
        brief,
        Number(duration),
        {
          lookId,
          beatSyncPulses,
          pixelEvidence: measuredEvidence,
        }
      );
      const compiled = compileDirectorCreativePlan(result, next);
      setReview({ ...compiled, result, reviewerUid: user.uid });
      setMessage('Review the shots below, then apply the motion to your editable timeline.');
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
      if (getAuth().currentUser?.uid !== review.reviewerUid) {
        throw Error('Your sign-in changed. Ask for a new plan.');
      }
      // Recompile against the current document, not the snapshot from the model request.
      const fresh = compileDirectorCreativePlan(review.result, latest.current.getSnapshot());
      await latest.current.onApply(fresh.plan);
      if (mounted.current) {
        setReview(null);
        setMessage(
          'Director edit applied. Every layer and motion key is editable; Undo restores your previous edit.'
        );
      }
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
        Your creative brief
        <textarea
          aria-label="Director creative brief"
          maxLength={1200}
          rows={4}
          value={brief}
          onChange={change(setBrief)}
          disabled={busy}
          placeholder="A wordless film where the city opens into the sea. Use the walking silhouette, bold colour and a connected reveal."
        />
      </label>
      <div className="studio-director-creative__controls">
        <label>
          Duration
          <input
            aria-label="Director edit duration"
            type="number"
            min="2"
            max="30"
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
          {busy ? 'Directing…' : 'Create my motion edit'}
        </button>
        <button
          type="button"
          data-testid="director-choreograph-btn"
          onClick={choreographSourceGraph}
          disabled={busy || locked || !brief.trim()}
        >
          Choreograph Source-Bound Cinema Graph
        </button>
      </div>
      <p className="studio-director-creative__context">
        Builds editable layers, masks, mattes, Null Rigs, Motion Drivers, and 3D LUT Color Grades
        from your brief. Samples saved clips for colour scopes and frame motion centroids.
      </p>
      {available === false && !message ? (
        <p role="status">Director planning is not enabled in this environment.</p>
      ) : null}
      {review ? (
        <div className="studio-director-creative__review" aria-label="Director storyboard">
          <h5>{review.plan.name}</h5>
          {review.concept ? <p className="studio-director-creative__concept">{review.concept}</p> : null}
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
              {review.topologySummary.colorGrade ? (
                <span>Look: {review.topologySummary.colorGrade.label}</span>
              ) : null}
            </div>
          ) : null}
          <ol>
            {review.shots.map((shot, i) => (
              <li key={i}>
                <span>
                  {shot.startTime.toFixed(1)}–{shot.endTime.toFixed(1)}s
                </span>
                <strong>{shot.sourceName}</strong>
                <b>{shot.treatment.replace(/_/g, ' ')}</b>
                <p>{shot.reason}</p>
              </li>
            ))}
          </ol>
          <p>
            {review.plan.actions.filter(a => a.type === 'media_plane').length} editable video layers ·{' '}
            {review.plan.actions
              .filter(a => a.type === 'keys')
              .reduce((n, a) => n + a.keys.length, 0)}{' '}
            motion keys
          </p>
          <div className="studio-director-creative__actions">
            <button
              className="studio-director-create"
              type="button"
              disabled={busy || locked}
              onClick={apply}
            >
              Apply Director edit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setReview(null);
                setMessage('Plan discarded. Your timeline is unchanged.');
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
