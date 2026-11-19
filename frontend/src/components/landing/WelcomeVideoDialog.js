import { useEffect, useRef, useState } from "react";
import videos from "./welcomeVideos.json";
import "./WelcomeVideoDialog.css";

export default function WelcomeVideoDialog() {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const dialog = useRef(null);
  const player = useRef(null);
  const launcher = useRef(null);
  const selected = videos[active];

  useEffect(() => {
    if (!open) return undefined;
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = previousOverflow;
      launcher.current?.focus({ preventScroll: true });
    };
  }, [open]);

  const select = index => {
    player.current?.pause();
    setFailed(false);
    setActive(index);
  };
  const enableSound = () => {
    const video = player.current;
    video.muted = false;
    setMuted(false);
    video.play()?.catch(() => {});
  };

  return (
    <>
      <button ref={launcher} type="button" className="welcome-video-launcher" onClick={() => setOpen(true)}>
        <span aria-hidden="true">▶</span> Watch AutoPromote videos
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="welcome-video-dialog"
          aria-labelledby="welcome-video-title"
          onCancel={event => { event.preventDefault(); setOpen(false); }}
          onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <div className="welcome-video-content">
            <header className="welcome-video-header">
              <div><span className="welcome-video-eyebrow">MADE IN AUTOPROMOTE</span><h2 id="welcome-video-title">See it. Then make it.</h2></div>
              <button type="button" className="welcome-video-close" aria-label="Close video showcase" autoFocus onClick={() => setOpen(false)}>×</button>
            </header>
            <div className="welcome-video-layout">
              <div className="welcome-video-main">
                <div className="welcome-video-screen">
                  <video
                    key={selected.id}
                    ref={player}
                    src={selected.src}
                    poster={selected.poster}
                    aria-label={selected.title}
                    crossOrigin="anonymous"
                    controls
                    autoPlay
                    muted={muted}
                    playsInline
                    preload="metadata"
                    onVolumeChange={() => setMuted(player.current?.muted ?? true)}
                    onError={() => setFailed(true)}
                  />
                  {muted && !failed && <button type="button" className="welcome-video-sound" onClick={enableSound}>♪ Turn sound on</button>}
                </div>
                <div className="welcome-video-description"><span>{selected.kind} · {selected.duration}</span><h3>{selected.title}</h3><p>{selected.description}</p></div>
                {failed && <p className="welcome-video-error" role="alert">This video could not load. <a href={selected.src} target="_blank" rel="noreferrer">Open the video</a> or choose another below.</p>}
              </div>
              <nav className="welcome-video-playlist" aria-label="AutoPromote videos">
                <span className="welcome-video-playlist-label">WATCH & CREATE</span>
                {videos.map((video, index) => (
                  <button key={video.id} type="button" aria-current={active === index ? "true" : undefined} onClick={() => select(index)}>
                    <span className="welcome-video-number">{active === index ? "▶" : String(index + 1).padStart(2, "0")}</span>
                    <span><strong>{video.title}</strong><small>{video.kind} · {video.duration}</small></span>
                  </button>
                ))}
                <button type="button" className="welcome-video-continue" onClick={() => setOpen(false)}>Explore AutoPromote <span aria-hidden="true">↗</span></button>
              </nav>
            </div>
            <footer className="welcome-video-footer"><span>Real Studio edit and product walkthroughs. Sound available.</span><span>Creative study · stock footage from Mixkit.</span></footer>
          </div>
        </dialog>
      )}
    </>
  );
}
