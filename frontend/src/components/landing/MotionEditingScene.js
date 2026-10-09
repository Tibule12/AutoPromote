import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import EditorHeroVisual from "./EditorHeroVisual";
import { EDITING_CHAPTERS } from "./editingSequence";
import LandingIcon from "./LandingIcon";
import MotionGraphicsLayer from "./MotionGraphicsLayer";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media?.addEventListener) return undefined;
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  return reduced;
}

const MotionEditingScene = forwardRef(function MotionEditingScene(
  { mode = "opening", onChapter, onGetStarted, onReplay, onPauseChange, onMotionAvailability },
  forwardedRef
) {
  const holder = useRef(null),
    canvas = useRef(null),
    controller = useRef(null),
    graphics = useRef(null);
  const chapterCallback = useRef(onChapter),
    visibility = useRef(false),
    progress = useRef(0),
    pause = useRef(false);
  const [mounted, setMounted] = useState(false),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false),
    [chapter, setChapter] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    onMotionAvailability?.(ready && !reduced && !failed);
  }, [ready, reduced, failed, onMotionAvailability]);
  chapterCallback.current = onChapter;
  useImperativeHandle(
    forwardedRef,
    () => ({
      setProgress(value) {
        progress.current = value;
        controller.current?.setProgress(value);
      },
    }),
    []
  );
  useEffect(() => {
    const element = holder.current;
    const sync = visible => {
      visibility.current = visible;
      if (visible) setMounted(true);
      controller.current?.setActive(visible && !document.hidden && !pause.current);
      graphics.current?.setActive(visible && !document.hidden && !pause.current);
    };
    if (!window.IntersectionObserver) {
      sync(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => sync(entry.isIntersecting), {
      threshold: 0.05,
    });
    observer.observe(element);
    const changed = () => {
      controller.current?.setActive(visibility.current && !document.hidden && !pause.current);
      graphics.current?.setActive(visibility.current && !document.hidden && !pause.current);
    };
    document.addEventListener("visibilitychange", changed);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", changed);
    };
  }, []);
  useEffect(() => {
    if (!mounted || reduced || failed) return undefined;
    let cancelled = false;
    const element = canvas.current;
    const unavailable = () => {
      setFailed(true);
      setReady(false);
    };
    element.addEventListener("sceneunavailable", unavailable);
    import("./createEditingScene")
      .then(module =>
        module.createEditingScene(element, {
          mode,
          compact: window.matchMedia("(max-width: 600px)").matches,
          onFrame: time => {
            if (!cancelled) graphics.current?.seek(time);
          },
          onChapter: index => {
            if (!cancelled) {
              setChapter(index);
              chapterCallback.current?.(index);
            }
          },
        })
      )
      .then(scene => {
        if (cancelled) {
          scene.dispose();
          return;
        }
        controller.current = scene;
        scene.setProgress(progress.current);
        scene.setPaused(pause.current);
        scene.setActive(visibility.current && !document.hidden && !pause.current);
        graphics.current?.setActive(visibility.current && !document.hidden && !pause.current);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) unavailable();
      });
    return () => {
      cancelled = true;
      element.removeEventListener("sceneunavailable", unavailable);
      controller.current?.dispose();
      controller.current = null;
      setReady(false);
    };
  }, [mounted, reduced, failed, mode]);
  const togglePause = () => {
    pause.current = !pause.current;
    setPaused(pause.current);
    onPauseChange?.(pause.current);
    controller.current?.setPaused(pause.current);
    controller.current?.setActive(visibility.current && !document.hidden && !pause.current);
    graphics.current?.setActive(visibility.current && !document.hidden && !pause.current);
  };
  const replay = () => {
    pause.current = false;
    setPaused(false);
    onPauseChange?.(false);
    controller.current?.setPaused(false);
    controller.current?.replay();
    controller.current?.setActive(visibility.current && !document.hidden);
    graphics.current?.setActive(visibility.current && !document.hidden);
    onReplay?.();
  };
  const fallback = reduced || failed;
  return (
    <div
      ref={holder}
      className={`lp-motion-scene ${ready ? "is-ready" : ""} ${fallback ? "is-fallback" : ""}`}
      data-mode={mode}
      data-renderer={ready ? "three-webgl" : fallback ? "static" : "loading"}
    >
      <div className="lp-motion-surface">
        <MotionGraphicsLayer ref={graphics} enabled={ready && !reduced && !failed} />
        {!ready && (
          <div className="lp-motion-fallback">
            <EditorHeroVisual />
          </div>
        )}
        {mounted && !fallback && (
          <canvas ref={canvas} className="lp-motion-canvas" aria-hidden="true" />
        )}
      </div>
      <div className="lp-film-controls">
        <div className="lp-film-status">
          <i />
          <span>
            {fallback
              ? "STILL PREVIEW"
              : mode === "scroll"
                ? "SCROLL TO DIRECT THE EDIT"
                : "THE AUTOPROMOTE EDITING FILM"}
          </span>
        </div>
        {!fallback && (
          <div className="lp-film-buttons">
            {mode === "opening" && (
              <button type="button" onClick={replay} disabled={!ready}>
                Replay film
              </button>
            )}
            <button
              type="button"
              onClick={togglePause}
              disabled={!ready}
              aria-label={paused ? "Resume editing animation" : "Pause editing animation"}
            >
              <LandingIcon name={paused ? "play" : "pause"} />
              {paused ? "Resume" : "Pause"}
            </button>
          </div>
        )}
      </div>
      <p className="lp-film-caption">
        {fallback
          ? "Motion is paused. Explore the editing workflow below or watch the podcast demo."
          : `Illustrative edit · ${EDITING_CHAPTERS[chapter].label} · Sample podcast footage`}
      </p>
      {ready && chapter === 7 && onGetStarted && (
        <button
          type="button"
          className="lp-button lp-button-primary lp-scene-cta"
          onClick={onGetStarted}
        >
          Start Creating <LandingIcon name="arrow" />
        </button>
      )}
    </div>
  );
});
export default MotionEditingScene;
