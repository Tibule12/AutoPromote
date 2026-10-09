import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { clamp } from "./editingSequence";
import { assetIsConfigured } from "./motionAssetManifest";

const runtimes = new Map();
function localAssetUrl(value) {
  const url = new URL(value, window.location.href);
  if (url.origin !== window.location.origin)
    throw new Error("Motion assets must be hosted locally");
  return url.href;
}
function lottieRuntime(src) {
  const url = localAssetUrl(src);
  if (!runtimes.has(url))
    runtimes.set(
      url,
      new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onload = () =>
          window.lottie?.loadAnimation
            ? resolve(window.lottie)
            : reject(new Error("Lottie runtime unavailable"));
        script.onerror = () => {
          script.remove();
          reject(new Error("Lottie runtime could not load"));
        };
        document.head.appendChild(script);
      }).catch(error => {
        runtimes.delete(url);
        throw error;
      })
    );
  return runtimes.get(url);
}

// This layer owns visual assets only. Navigation, auth and CTAs stay normal HTML.
// It is clock-controlled: reverse scroll, pause and replay seek actual asset frames.
const MotionAssetLayer = forwardRef(function MotionAssetLayer({ asset, enabled }, ref) {
  const container = useRef(null),
    video = useRef(null),
    driver = useRef(null);
  const latestTime = useRef(0),
    active = useRef(false),
    seekPending = useRef(null);
  const mediaLoaded = useRef(false);
  const [failed, setFailed] = useState(false);
  const urls = useMemo(() => {
    try {
      if (!assetIsConfigured(asset)) return null;
      return {
        src: asset.src ? localAssetUrl(asset.src) : null,
        sources: asset.sources?.map(source => ({ ...source, src: localAssetUrl(source.src) })),
        runtimeSrc: asset.runtimeSrc ? localAssetUrl(asset.runtimeSrc) : null,
      };
    } catch (_) {
      return null;
    }
  }, [asset]);
  const configured = Boolean(urls);
  const seek = time => {
    latestTime.current = time;
    if (!container.current || failed) return;
    const inRange = time >= asset.start && time <= asset.end;
    container.current.style.opacity = inRange ? "1" : "0";
    if (!inRange) {
      video.current?.pause();
      return;
    }
    const progress = clamp((time - asset.start) / Math.max(0.01, asset.end - asset.start));
    if (driver.current)
      driver.current.goToAndStop(progress * Math.max(0, driver.current.totalFrames - 1), true);
    const element = video.current;
    if (element && !mediaLoaded.current) {
      mediaLoaded.current = true;
      element.preload = "metadata";
      element.load();
    }
    if (element?.duration && Number.isFinite(element.duration)) {
      const target = progress * Math.max(0, element.duration - 0.04);
      if (element.seeking) seekPending.current = target;
      else if (Math.abs(element.currentTime - target) > 0.035) element.currentTime = target;
    }
  };
  useImperativeHandle(ref, () => ({
    seek,
    setActive(value) {
      active.current = value;
      if (!value) video.current?.pause();
    },
  }));
  useEffect(() => {
    if (!enabled || !configured || failed) return undefined;
    let cancelled = false;
    const media = video.current;
    if (asset.format === "lottie") {
      lottieRuntime(urls.runtimeSrc)
        .then(runtime => {
          if (cancelled) return;
          driver.current = runtime.loadAnimation({
            container: container.current,
            renderer: "svg",
            loop: false,
            autoplay: false,
            path: urls.src,
            rendererSettings: { preserveAspectRatio: "xMidYMid meet" },
          });
          driver.current.addEventListener("DOMLoaded", () => {
            if (!cancelled) seek(latestTime.current);
          });
          driver.current.addEventListener("data_failed", () => {
            if (!cancelled) setFailed(true);
          });
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    }
    return () => {
      cancelled = true;
      driver.current?.destroy();
      driver.current = null;
      if (media) {
        media.pause();
        media.removeAttribute("src");
        media.querySelectorAll("source").forEach(source => source.removeAttribute("src"));
        media.load();
      }
      mediaLoaded.current = false;
    };
    // Asset objects are stable manifest entries; the seek callback reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset, enabled, configured, failed]);
  if (!enabled || !configured || failed) return null;
  return (
    <div
      ref={container}
      className={`lp-authored-motion lp-authored-${asset.id}`}
      aria-hidden="true"
      data-asset-format={asset.format}
      style={{ objectFit: asset.fit || "contain" }}
    >
      {asset.format === "video" && (
        <video
          ref={video}
          muted
          playsInline
          preload="none"
          poster={asset.poster || undefined}
          onError={() => setFailed(true)}
          onLoadedMetadata={() => seek(latestTime.current)}
          onSeeked={() => {
            if (seekPending.current !== null && active.current) {
              const target = seekPending.current;
              seekPending.current = null;
              video.current.currentTime = target;
            }
          }}
        >
          {urls.sources.map(source => (
            <source key={source.src} src={source.src} type={source.type} />
          ))}
        </video>
      )}
      {asset.format === "image" && <img src={urls.src} alt="" onError={() => setFailed(true)} />}
    </div>
  );
});
export default MotionAssetLayer;
