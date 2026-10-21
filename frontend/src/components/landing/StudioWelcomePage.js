import { useCallback, useEffect, useRef, useState } from "react";
import LandingNavbar from "./LandingNavbar";
import LandingFooter from "./LandingFooter";
import LandingIcon from "./LandingIcon";
import PlatformIcon from "../PlatformIcon";
import "./StudioWelcomePage.css";

const MEDIA = "/_studio-preview/";
const CHANNELS = ["linkedin", "youtube", "instagram", "tiktok", "facebook", "reddit"];
const NAMES = {
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  reddit: "Reddit",
};
export const STUDIO_STORY = [
  {
    id: "result",
    label: "Make the edit",
    word: "Create.",
    title: "Give your footage a point of view.",
    copy: "Cuts, motion, sound and the finishing details. Shape the film in Studio, with your decisions on the timeline.",
    file: "film.mp4",
    poster: "film.jpg",
    watch: "Watch the finished film",
    start: 12,
  },
  {
    id: "studio",
    label: "See the decisions",
    word: "Shape.",
    title: "Every choice has its place.",
    copy: "See the actual edit behind this film. The picture, layers and sound stay together in an editable project.",
    file: "studio.mp4",
    poster: "studio.jpg",
    watch: "Watch the matching Studio edit",
    start: 12,
  },
  {
    id: "post",
    label: "Prepare the post",
    word: "Adapt.",
    title: "Same video. A different conversation.",
    copy: "This vertical breakdown became six posts, each with its own title, caption and publish time. Explore the actual scheduled copy below.",
    file: "breakdown.mp4",
    poster: "breakdown.jpg",
    watch: "Watch the scheduled video",
    start: 10,
  },
  {
    id: "queue",
    label: "Choose the moment",
    word: "Schedule.",
    title: "Your whole next move, in view.",
    copy: "Preview the content, check each destination and choose its time. Follow the release from your Queue.",
    file: "queue.mp4",
    poster: "queue.png",
    watch: "Open the actual Queue capture",
    start: 0,
  },
];
const clamp = n => Math.max(0, Math.min(1, n));
function useReducedMotion() {
  const [value, setValue] = useState(() =>
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setValue(Boolean(q?.matches));
    q?.addEventListener?.("change", update);
    return () => q?.removeEventListener?.("change", update);
  }, []);
  return value;
}
function MediaDialog({ item, close }) {
  const ref = useRef(null),
    stage = useRef(null),
    pan = useRef(null);
  const [zoom, setZoom] = useState(1);
  const changeZoom = value => {
    const next = Math.max(1, Math.min(4, value));
    const node = stage.current;
    const x = (node.scrollLeft + node.clientWidth / 2) / Math.max(1, node.scrollWidth);
    const y = (node.scrollTop + node.clientHeight / 2) / Math.max(1, node.scrollHeight);
    setZoom(next);
    requestAnimationFrame(() => {
      if (!stage.current) return;
      node.scrollLeft = next === 1 ? 0 : x * node.scrollWidth - node.clientWidth / 2;
      node.scrollTop = next === 1 ? 0 : y * node.scrollHeight - node.clientHeight / 2;
    });
  };
  useEffect(() => {
    const dialog = ref.current,
      active = document.activeElement,
      back = active?.closest("button, a[href], [tabindex='0']") || active,
      overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      back?.focus();
    };
  }, []);
  return (
    <dialog
      className="wf-dialog"
      ref={ref}
      aria-labelledby="wf-dialog-title"
      onCancel={e => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <div>
          <span>AUTOPROMOTE / THE ACTUAL WORKFLOW</span>
          <h2 id="wf-dialog-title">{item.title}</h2>
        </div>
        <div className="wf-viewer-actions">
          {item.image && (
            <>
              <button type="button" aria-label="Fit image to screen" onClick={() => changeZoom(1)}>
                Fit
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => changeZoom(zoom - 0.25)}
              >
                −
              </button>
              <output aria-label="Image zoom">{Math.round(zoom * 100)}%</output>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= 4}
                onClick={() => changeZoom(zoom + 0.25)}
              >
                +
              </button>
            </>
          )}
          <button
            className="wf-dialog-close"
            type="button"
            aria-label="Close preview"
            onClick={close}
          >
            <LandingIcon name="close" />
          </button>
        </div>
      </header>
      <div
        className={`wf-viewer-stage${item.image && zoom > 1 ? " is-zoomed" : ""}`}
        ref={stage}
        tabIndex={item.image ? 0 : undefined}
        aria-label={item.image ? "Image viewer; scroll to pan when zoomed" : undefined}
        onPointerDown={event => {
          if (!item.image || zoom <= 1 || event.pointerType !== "mouse" || event.button !== 0)
            return;
          event.preventDefault();
          pan.current = {
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={event => {
          if (!pan.current) return;
          event.currentTarget.scrollLeft = pan.current.left - (event.clientX - pan.current.x);
          event.currentTarget.scrollTop = pan.current.top - (event.clientY - pan.current.y);
        }}
        onPointerUp={() => {
          pan.current = null;
        }}
        onLostPointerCapture={() => {
          pan.current = null;
        }}
      >
        {item.image ? (
          <div
            className="wf-image-canvas"
            style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          >
            <img src={MEDIA + item.file} alt={item.title} draggable="false" />
          </div>
        ) : (
          <video src={MEDIA + item.file} controls autoPlay playsInline preload="metadata" />
        )}
      </div>
      <p>
        {item.note || "Native Studio film. Stock-footage creative study with designed sound."}
        {item.image && <span> Zoom to inspect details. Drag or scroll to pan.</span>}
      </p>
    </dialog>
  );
}
function NativeVideo({
  file,
  poster,
  active = true,
  reduced,
  start = 0,
  loopSeconds = 7,
  label,
  className = "",
}) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    let visible = false;
    const update = () => {
      if (active && visible && !reduced && !document.hidden) video.play()?.catch(() => {});
      else video.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(video);
    document.addEventListener("visibilitychange", update);
    if (!active || reduced) video.pause();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
      video.pause();
    };
  }, [active, reduced]);
  return (
    <video
      ref={ref}
      className={className}
      src={MEDIA + file}
      poster={MEDIA + poster}
      muted
      playsInline
      preload="metadata"
      aria-label={label}
      onLoadedMetadata={e => {
        if (start) e.currentTarget.currentTime = start;
      }}
      onTimeUpdate={e => {
        if (active && e.currentTarget.currentTime > start + loopSeconds)
          e.currentTarget.currentTime = start;
      }}
      onEnded={e => {
        e.currentTarget.currentTime = start;
        if (active && !reduced) e.currentTarget.play()?.catch(() => {});
      }}
    />
  );
}
function StudioReel({ reduced, watch }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="wf-reel">
      <div className="wf-reel-topline">
        <span>
          <i /> THE WORK SPEAKS FIRST.
        </span>
        <span>01 / PICTURE → PROCESS → POST</span>
      </div>
      <div className="wf-reel-picture">
        <NativeVideo
          file="welcome-reel.mp4"
          poster="welcome-reel.jpg"
          active={!paused}
          reduced={reduced}
          loopSeconds={28}
          label="From the finished film into its real Studio edit and six platform posts"
        />
        <button
          className="wf-reel-play"
          type="button"
          aria-label="Watch the welcome Studio film with sound"
          onClick={() =>
            watch({
              title: "From the frame to your next six posts",
              file: "welcome-reel.mp4",
              note: "Picture, motion and sound edited in AutoPromote Studio. Stock kitchen-film study; real Studio and Queue recordings captured 21 October 2026.",
            })
          }
        >
          <span>
            <LandingIcon name="play" />
          </span>
          <span>
            See what’s inside<small>28 seconds · Watch with sound</small>
          </span>
        </button>
        {!reduced && (
          <button
            className="wf-reel-pause"
            type="button"
            onClick={() => setPaused(value => !value)}
            aria-label={paused ? "Play welcome preview" : "Pause welcome preview"}
            aria-pressed={paused}
          >
            {paused ? "▶" : "Ⅱ"}
          </button>
        )}
      </div>
      <div className="wf-reel-caption">
        <p>
          That edit? <strong>Made in the Studio you’re about to open.</strong>
        </p>
        <button
          type="button"
          onClick={() =>
            watch({
              title: "The welcome film — its complete Studio timeline",
              file: "welcome-reel-studio.mp4",
              note: "Complete playback of this exact welcome film beside its matching editable Studio timeline. Native Studio export and recorded playback; QA capture is muted and the exact final soundtrack accompanies it.",
            })
          }
        >
          Watch its Studio timeline <span>↗</span>
        </button>
      </div>
    </div>
  );
}
function ScrollWorkflow({ reduced, watch }) {
  const ref = useRef(null),
    [step, setStep] = useState(0);
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect(),
      p = clamp(-r.top / Math.max(1, r.height - window.innerHeight));
    el.style.setProperty("--wf-progress", p);
    setStep(Math.min(3, Math.floor(p * 4)));
  }, []);
  useEffect(() => {
    if (reduced) return undefined;
    let raf = 0;
    const schedule = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          update();
        });
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(raf);
    };
  }, [reduced, update]);
  const choose = index => {
    if (reduced) {
      setStep(index);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    window.scrollTo({
      top: window.scrollY + r.top + ((index + 0.32) / 4) * (r.height - window.innerHeight),
      behavior: "instant",
    });
  };
  const item = STUDIO_STORY[step];
  return (
    <section
      className={`wf-workflow${reduced ? " wf-workflow-reduced" : ""}`}
      id="workspace"
      ref={ref}
      aria-label="The real creative workflow"
    >
      <div className="wf-sticky">
        <div className="wf-stage-heading">
          <span className="wf-eyebrow">ONE FILM. ITS NEXT CHAPTER.</span>
          <span>
            0{step + 1} <i>/</i> 04
          </span>
        </div>
        <div className="wf-stage">
          <div className="wf-stage-copy">
            <span className="wf-stage-word" aria-hidden="true">
              {item.word}
            </span>
            <span className="wf-eyebrow">{item.label}</span>
            <h2>{item.title}</h2>
            <p>{item.copy}</p>
          </div>
          <div className={`wf-stage-picture wf-stage-${item.id}`} data-step={item.id}>
            <div className="wf-window-bar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <b>
                {item.id === "queue"
                  ? "ACTUAL QUEUE · 21 OCT 2026"
                  : item.id === "post"
                    ? "THE VIDEO SCHEDULED TO SIX CHANNELS"
                    : "CREATED IN AUTOPROMOTE STUDIO"}
              </b>
              <span>↗</span>
            </div>
            <div className="wf-stage-screen">
              {STUDIO_STORY.map((s, i) => (
                <div
                  key={s.id}
                  className={`wf-native-pane${i === step ? " is-active" : ""}`}
                  aria-hidden={i !== step}
                >
                  <NativeVideo
                    {...s}
                    active={i === step}
                    reduced={reduced}
                    label={
                      s.id === "queue" ? "Actual Queue recording from 21 October 2026" : s.title
                    }
                  />
                </div>
              ))}
            </div>
            <button
              className="wf-stage-watch"
              type="button"
              onClick={() =>
                watch({
                  title: item.watch,
                  file: item.id === "queue" ? "queue.png" : item.file,
                  image: item.id === "queue",
                  note:
                    item.id === "queue"
                      ? "Actual signed-in Queue captured 21 October 2026. Six scheduled posts at capture; this recording does not update live."
                      : item.id === "post"
                        ? "The exact vertical video in this six-platform release. Stock study, designed sound and synthetic narration."
                        : undefined,
                })
              }
            >
              {item.watch}
              <LandingIcon name={item.id === "queue" ? "arrow" : "play"} />
            </button>
          </div>
        </div>
        <nav className="wf-steps" aria-label="Explore the workflow">
          {STUDIO_STORY.map((s, i) => (
            <button
              type="button"
              key={s.id}
              aria-current={step === i ? "step" : undefined}
              onClick={() => choose(i)}
            >
              <span>0{i + 1}</span>
              {s.label}
              <i />
            </button>
          ))}
        </nav>
        <div className="wf-progress" aria-hidden="true">
          <i />
        </div>
      </div>
    </section>
  );
}
function ChannelPosts({ data, watch }) {
  const [selected, setSelected] = useState("linkedin");
  if (!data)
    return (
      <div className="wf-release-loading" role="status">
        Loading the recorded release…
      </div>
    );
  const current = data.destinations.find(p => p.platform === selected) || data.destinations[0];
  return (
    <div className="wf-channel-proof">
      <div className="wf-channel-tabs" role="tablist" aria-label="Actual scheduled platform posts">
        {CHANNELS.map(id => (
          <button
            type="button"
            role="tab"
            key={id}
            id={`wf-tab-${id}`}
            aria-label={NAMES[id]}
            aria-controls="wf-post-panel"
            aria-selected={current.platform === id}
            tabIndex={current.platform === id ? 0 : -1}
            onClick={() => setSelected(id)}
            onKeyDown={event => {
              const index = CHANNELS.indexOf(id);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % 6
                  : event.key === "ArrowLeft"
                    ? (index + 5) % 6
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? 5
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              setSelected(CHANNELS[next]);
              event.currentTarget.parentElement.children[next].focus();
            }}
          >
            <PlatformIcon platform={id} />
            <span>{NAMES[id]}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="wf-post-panel"
        aria-labelledby={`wf-tab-${current.platform}`}
        className="wf-post-panel"
      >
        <div className="wf-post-copy">
          <span className="wf-eyebrow">
            SCHEDULED POST / {NAMES[current.platform].toUpperCase()}
          </span>
          <h3>{current.title}</h3>
          <p>{current.description.split("\n\n")[0]}</p>
          <div className="wf-post-time">
            <span>Scheduled at capture</span>
            <strong>{current.label} SAST</strong>
          </div>
          <details>
            <summary>Read the full scheduled caption</summary>
            <p>{current.description}</p>
          </details>
        </div>
        <button
          className="wf-post-capture"
          type="button"
          aria-label={`Open actual ${NAMES[current.platform]} post capture`}
          onClick={() =>
            watch({
              title: `The actual ${NAMES[current.platform]} post`,
              image: true,
              file: `destination-${current.platform}.png`,
              note: "Captured from the actual signed-in Queue on 21 October 2026. These are recorded controls; they do not change the scheduled post.",
            })
          }
        >
          <img
            src={MEDIA + `destination-${current.platform}.png`}
            alt={`Actual ${NAMES[current.platform]} title, caption and scheduled time in Queue`}
            loading="lazy"
          />
          <span>
            Open the actual post <LandingIcon name="arrow" />
          </span>
        </button>
      </div>
    </div>
  );
}
export default function StudioWelcomePage({ onGetStarted, onSignIn }) {
  const [preview, setPreview] = useState(null),
    [release, setRelease] = useState(null),
    [failed, setFailed] = useState(false),
    reduced = useReducedMotion();
  useEffect(() => {
    const controller = new AbortController();
    fetch(MEDIA + "release-data.json", { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw Error("Unavailable capture");
        return r.json();
      })
      .then(data => {
        if (
          !Array.isArray(data.destinations) ||
          CHANNELS.some(id => !data.destinations.some(d => d.platform === id))
        )
          throw Error("Incomplete capture");
        setRelease(data);
      })
      .catch(e => {
        if (e.name !== "AbortError") setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <div className="wf-page">
      <a className="wf-skip" href="#wf-main">
        Skip to content
      </a>
      <LandingNavbar onGetStarted={onGetStarted} onSignIn={onSignIn} />
      <main id="wf-main">
        <section className="wf-hero">
          <div className="wf-hero-top">
            <div>
              <span className="wf-eyebrow">
                <i /> A CREATIVE STUDIO. A PLAN FOR EVERY POST.
              </span>
              <h1>
                More creating.
                <br />
                <em>Less posting work.</em>
              </h1>
            </div>
            <div className="wf-hero-intro">
              <p>
                Make the edit in Studio. Give each channel its own post. Choose the dates, then keep
                the whole plan in one Queue.
              </p>
              <button className="wf-primary" type="button" onClick={onGetStarted}>
                Start creating free <LandingIcon name="arrow" />
              </button>
              <a className="wf-text-link" href="#workspace">
                See the real workflow <span>↓</span>
              </a>
              <small>Free account to start. Paid tools and exports use credits.</small>
            </div>
          </div>
          <StudioReel reduced={reduced} watch={setPreview} />
          <div className="wf-hero-context">
            <span>BEHIND THE FILM. A REAL WORKFLOW.</span>
            <p>
              The result, the editable timeline and the next six posts. Follow one idea all the way
              through.
            </p>
          </div>
          <div className="wf-hero-product">
            <div className="wf-hero-glow" aria-hidden="true" />
            <button
              type="button"
              className="wf-queue-window"
              aria-label="Open the actual Queue"
              onClick={() =>
                setPreview({
                  title: "Your content, its next six posts",
                  image: true,
                  file: "queue.png",
                  note: "Actual Queue capture from 21 October 2026, showing the six scheduled posts and their separate times. This is a recording, not a live queue.",
                })
              }
            >
              <div className="wf-window-bar">
                <span>
                  <i />
                  <i />
                  <i />
                </span>
                <b>AUTOPROMOTE / YOUR CONTENT IN MOTION</b>
                <span>↗</span>
              </div>
              <img
                src={MEDIA + "queue.png"}
                alt="Actual AutoPromote Queue with six real scheduled restaurant posts, separate platform times and playable media"
                fetchPriority="high"
              />
              <div className="wf-proof-date">
                <i /> ACTUAL WORKSPACE · RECORDED 21 OCT 2026 <span>Open full view ↗</span>
              </div>
            </button>
            <button
              type="button"
              className="wf-result-float"
              aria-label="Watch the Studio film"
              onClick={() =>
                setPreview({ title: "THE LAST TOUCH — the finished Studio film", file: "film.mp4" })
              }
            >
              <NativeVideo
                file="film.mp4"
                poster="film.jpg"
                reduced={reduced}
                start={12}
                label="Finished food film created in Studio"
              />
              <span>
                <LandingIcon name="play" /> Made in your Studio.
              </span>
            </button>
          </div>
          <div className="wf-channel-line">
            <span>YOUR CONTENT. YOUR CONNECTED CHANNELS.</span>
            <div>
              {CHANNELS.map(id => (
                <span key={id}>
                  <PlatformIcon platform={id} />
                  {NAMES[id]}
                </span>
              ))}
            </div>
          </div>
        </section>
        <ScrollWorkflow reduced={reduced} watch={setPreview} />
        <section className="wf-posts" id="features">
          <div className="wf-section-title">
            <span className="wf-eyebrow">ONE VIDEO DOESN’T NEED ONE GENERIC CAPTION.</span>
            <h2>
              Six channels.
              <br />
              <em>Six conversations.</em>
            </h2>
            <p>
              Explore a real scheduled campaign. The video stays the same; the titles, captions and
              publish times change for each channel.
            </p>
          </div>
          {failed ? (
            <p role="status">The recorded release is temporarily unavailable.</p>
          ) : (
            <ChannelPosts data={release} watch={setPreview} />
          )}
          <p className="wf-capture-note">
            Actual scheduled copy captured 21 October 2026 · Times shown in Africa/Johannesburg ·
            Publication happens separately.
          </p>
        </section>
        <section className="wf-release" id="workflow">
          <div className="wf-release-heading">
            <span className="wf-eyebrow">THE PLAN IS PART OF THE CREATIVE WORK.</span>
            <h2>
              Finish the edit.
              <br />
              <em>Know what happens next.</em>
            </h2>
            <p>
              Your video, captions, destinations and dates. See them together before the posts go
              out.
            </p>
          </div>
          <button
            className="wf-calendar-capture"
            type="button"
            aria-label="Open actual release calendar"
            onClick={() =>
              setPreview({
                title: "Your Queue and release calendar",
                image: true,
                file: "queue.png",
                note: "Actual release calendar captured 21 October 2026. Recorded scheduled state; provider publication is separate.",
              })
            }
          >
            <img
              src={MEDIA + "calendar.png"}
              alt="Actual release calendar with LinkedIn, YouTube, Instagram, TikTok, Facebook and Reddit at six different times"
              loading="lazy"
            />
            <span>
              THE ACTUAL RELEASE CALENDAR <b>Open full view ↗</b>
            </span>
          </button>
          <div className="wf-benefits">
            <div>
              <b>01</b>
              <h3>Make it yours.</h3>
              <p>
                Cut, arrange and refine the edit in Studio. Keep the project and its decisions
                together.
              </p>
            </div>
            <div>
              <b>02</b>
              <h3>Give each post its space.</h3>
              <p>
                Prepare the title and caption for that audience. Pick a separate day and time for
                each destination.
              </p>
            </div>
            <div>
              <b>03</b>
              <h3>Keep the next move visible.</h3>
              <p>
                Preview media, review the calendar and follow each destination’s publishing status
                from Queue.
              </p>
            </div>
          </div>
        </section>
        <section className="wf-final">
          <span className="wf-eyebrow">LESS RUNNING AROUND. MORE ROOM TO CREATE.</span>
          <h2>
            Make something
            <br />
            <em>worth sharing.</em>
          </h2>
          <button className="wf-primary" type="button" onClick={onGetStarted}>
            Start creating free <LandingIcon name="arrow" />
          </button>
          <p>Your footage. Your edit. Your next posts.</p>
          <a href="/#/pricing">See plans and credit costs</a>
        </section>
      </main>
      <LandingFooter />
      {preview && <MediaDialog item={preview} close={() => setPreview(null)} />}
    </div>
  );
}
