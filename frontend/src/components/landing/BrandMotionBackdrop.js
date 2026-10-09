import { useEffect, useRef, useState } from "react";

// Original L40S generated art; product actions and screenshots stay in HTML.
export default function BrandMotionBackdrop({ reducedMotion, paused = false }) {
  const holder = useRef(null);
  const video = useRef(null);
  const active = useRef(false);
  const [load, setLoad] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (reducedMotion || failed) return undefined;
    let visible = false;
    const update = () => {
      const media = video.current;
      if (!media) return;
      active.current = visible && !document.hidden && !paused;
      if (active.current) {
        setLoad(true);
        media.play()?.catch(() => {});
      } else media.pause();
    };
    const observer = window.IntersectionObserver ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      update();
    }, { threshold: 0.05 }) : null;
    observer?.observe(holder.current);
    if (!observer) {
      visible = true;
      update();
    }
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", update);
      active.current = false;
    };
  }, [reducedMotion, failed, paused]);
  useEffect(() => {
    const media = video.current;
    if (!load || reducedMotion || failed || !media) return;
    // Start resource selection after React has attached src. Calling play in
    // the observer before that commit can leave preload=none without metadata.
    media.load();
    if (active.current) media.play()?.catch(() => {});
  }, [load, reducedMotion, failed]);
  useEffect(() => {
    const ownedMedia = video.current;
    return () => {
      ownedMedia?.pause();
      ownedMedia?.removeAttribute("src");
      ownedMedia?.load();
    };
  }, [reducedMotion, failed]);
  return (
    <div ref={holder} className="lp-brand-motion" aria-hidden="true">
      <img src="/landing/autopromote-violet-ribbon.webp" alt="" width="1280" height="704" />
      {!reducedMotion && !failed && (
        <video ref={video} muted loop playsInline preload="none"
          src={load ? "/landing/autopromote-violet-ribbon.mp4" : undefined}
          onLoadedData={() => { if (active.current) video.current?.play()?.catch(() => {}); }}
          onError={() => setFailed(true)} />
      )}
    </div>
  );
}
