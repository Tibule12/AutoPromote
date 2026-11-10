import { useEffect, useRef, useState } from "react";
import LandingIcon from "./LandingIcon";
import { PRODUCT_TOUR, chapterAtTime } from "./productTour";
import "./ProductTour.css";

export default function ProductTourPlayer() {
  const ref = useRef(null);
  const pendingSeek = useRef(null);
  const retry = useRef(0);
  const [started, setStarted] = useState(false);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const video = ref.current;
    const pauseWhenHidden = () => { if (document.hidden) video.pause(); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    const observer = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) video.pause();
      }, { threshold: 0 }) : null;
    observer?.observe(video);
    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, []);

  const play = target => {
    const video = ref.current;
    setFailed(false);
    setNotice("");
    setStarted(true);
    setActive(chapterAtTime(target));
    if (!video.hasAttribute("src") || video.error || failed) {
      pendingSeek.current = target;
      if (failed) retry.current++;
      video.src = retry.current ? `${PRODUCT_TOUR.src}?retry=${retry.current}` : PRODUCT_TOUR.src;
      video.load();
    } else if (video.readyState >= 1) video.currentTime = target;
    else pendingSeek.current = target;
    video.play()?.catch(error => {
      if (error.name !== "AbortError") setNotice("Playback paused. Use the video controls to continue.");
    });
  };

  return (
    <div className="lp-product-tour" data-testid="product-tour">
      <div className="lp-tour-masthead">
        <span><i aria-hidden="true" /> AUTOPROMOTE / IN ACTION</span>
        <span>01 — 04 <b aria-hidden="true">/</b> 00:36</span>
      </div>
      <div className="lp-tour-screen">
        <video
          ref={ref}
          poster={PRODUCT_TOUR.poster}
          controls={started && !failed}
          playsInline
          preload="none"
          aria-label="AutoPromote product tour"
          onLoadedMetadata={() => {
            if (pendingSeek.current !== null) {
              ref.current.currentTime = pendingSeek.current;
              pendingSeek.current = null;
            }
          }}
          onTimeUpdate={() => setActive(chapterAtTime(ref.current.currentTime))}
          onError={() => {
            setFailed(true);
            setNotice("The tour could not load. Retry or open the video directly.");
          }}
        >
          <track kind="captions" src={PRODUCT_TOUR.captions} srcLang="en" label="English" />
        </video>
        {(!started || failed) && (
          <div className="lp-tour-cover">
            <button type="button" onClick={() => play(PRODUCT_TOUR.chapters[active].start)}>
              <span className="lp-tour-play"><LandingIcon name="play" /></span>
              <span>{failed ? "Retry product tour" : "Play product tour"}<small>Four pages. One creative flow.</small></span>
            </button>
          </div>
        )}
      </div>
      <div className="lp-tour-chapters" role="group" aria-label="Product tour chapters">
        {PRODUCT_TOUR.chapters.map((chapter, index) => (
          <button key={chapter.id} type="button" aria-pressed={active === index} onClick={() => play(chapter.start)}>
            <span className="lp-tour-index">0{index + 1}</span>
            <span><strong>{chapter.title}</strong><small>{chapter.copy}</small></span>
            <LandingIcon name="arrow" />
          </button>
        ))}
      </div>
      <div className="lp-tour-footnote">
        <span>Recorded in AutoPromote · Sample workspace and metrics</span>
        <a href={PRODUCT_TOUR.src} target="_blank" rel="noreferrer">Open film <span aria-hidden="true">↗</span></a>
      </div>
      {notice && <p className="lp-tour-notice" role="status">{notice}</p>}
    </div>
  );
}
