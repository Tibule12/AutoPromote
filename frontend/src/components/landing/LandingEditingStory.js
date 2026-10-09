import { useEffect, useRef, useState } from "react";
import MotionEditingScene, { useReducedMotion } from "./MotionEditingScene";
import { clamp, EDITING_CHAPTERS } from "./editingSequence";
import LandingIcon from "./LandingIcon";

export default function LandingEditingStory({ onGetStarted }) {
  const container = useRef(null),
    scene = useRef(null);
  const [chapter, setChapter] = useState(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced || !window.IntersectionObserver) return undefined;
    let frame = 0,
      visible = false;
    const update = () => {
      frame = 0;
      const element = container.current,
        rect = element.getBoundingClientRect();
      const progress = clamp(-rect.top / Math.max(1, rect.height - window.innerHeight));
      scene.current?.setProgress(progress);
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
        setChapter(Math.min(7, Math.floor(progress * 8)));
      element.style.setProperty("--story-progress", progress);
    };
    const schedule = () => {
      if (visible && !frame) frame = requestAnimationFrame(update);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      schedule();
    });
    observer.observe(container.current);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [reduced]);
  const jump = index => {
    const rect = container.current.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + rect.top + (index / 7) * (rect.height - window.innerHeight),
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  const current = EDITING_CHAPTERS[chapter];
  if (reduced)
    return (
      <section className="lp-section lp-story-reduced" aria-labelledby="editing-story-heading">
        <div className="lp-section-heading">
          <p className="lp-eyebrow">THE MAKING OF A CLIP</p>
          <h2 id="editing-story-heading">
            Every angle.
            <br />
            <span>One creative flow.</span>
          </h2>
        </div>
        <ol>
          {EDITING_CHAPTERS.map((item, index) => (
            <li key={item.label}>
              <span>
                0{index + 1} / {item.label}
              </span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </li>
          ))}
        </ol>
      </section>
    );
  return (
    <section
      className="lp-editing-story"
      ref={container}
      aria-labelledby="editing-story-heading"
      id="editing-story"
    >
      <div className="lp-story-sticky">
        <div className="lp-story-top">
          <p className="lp-eyebrow">SCROLL THROUGH THE MAKING OF A CLIP</p>
          <span>0{chapter + 1} / 08</span>
        </div>
        <div className="lp-story-layout">
          <div className="lp-story-copy">
            <span className="lp-story-label">{current.label}</span>
            <h2 id="editing-story-heading" className="lp-story-title-matte">
              <span key={current.title}>{current.title}</span>
            </h2>
            <p>{current.copy}</p>
            <ol className="lp-story-chapters">
              {EDITING_CHAPTERS.map((item, index) => (
                <li key={item.label}>
                  <button
                    type="button"
                    aria-current={index === chapter ? "step" : undefined}
                    onClick={() => jump(index)}
                  >
                    <i />
                    <span>0{index + 1}</span>
                    {item.label}
                  </button>
                </li>
              ))}
            </ol>
            <button type="button" className="lp-button lp-button-primary" onClick={onGetStarted}>
              Start Creating <LandingIcon name="arrow" />
            </button>
          </div>
          <MotionEditingScene
            ref={scene}
            mode="scroll"
            onChapter={setChapter}
            onGetStarted={onGetStarted}
          />
        </div>
        <div className="lp-story-progress" aria-hidden="true">
          <i />
        </div>
      </div>
    </section>
  );
}
