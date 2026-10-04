import React, { useEffect, useState } from "react";

const thumbnailCache = new Map();

// One silent decoder for the whole filmstrip. It never seeks the programme
// monitor and releases its media on cancellation, source changes or unmount.
export default function TimelineSourceFilmstrip({ frames = [] }) {
  const sampled =
    frames.length <= 24
      ? frames
      : Array.from(
          { length: 24 },
          (_, index) => frames[Math.round((index * (frames.length - 1)) / 23)]
        );
  const signature = JSON.stringify(sampled.map(frame => [frame.id, frame.src, frame.previewTime]));
  const [images, setImages] = useState({ signature: "", values: {} });
  const [sampling, setSampling] = useState({ error: "", time: null });
  useEffect(() => {
    const requested = JSON.parse(signature);
    if (!requested.length) return undefined;
    const values = {};
    for (const [id, src, time] of requested) {
      const cached = thumbnailCache.get(JSON.stringify([src, time]));
      if (cached) values[id] = cached;
    }
    if (Object.keys(values).length) setImages({ signature, values: { ...values } });
    if (Object.keys(values).length === requested.length) return undefined;
    const controller = new AbortController();
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.tabIndex = -1;
    video.setAttribute("aria-hidden", "true");
    video.dataset.studioThumbnailDecoder = "true";
    Object.assign(video.style, {
      position: "fixed",
      left: "-10000px",
      width: "128px",
      height: "72px",
    });
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 72;
    const context = canvas.getContext("2d");
    if (!context) return undefined;
    document.body.appendChild(video);
    const waitFor = (event, action) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => done(new Error("Thumbnail timeout")), 60000);
        const success = () => done();
        const failure = () => done(new Error("Thumbnail media unavailable"));
        const done = error => {
          clearTimeout(timeout);
          video.removeEventListener(event, success);
          video.removeEventListener("error", failure);
          controller.signal.removeEventListener("abort", failure);
          error ? reject(error) : resolve();
        };
        video.addEventListener(event, success, { once: true });
        video.addEventListener("error", failure, { once: true });
        controller.signal.addEventListener("abort", failure, { once: true });
        try {
          action();
        } catch (error) {
          done(error);
        }
      });
    const failedSources = new Set();
    (async () => {
      let source = "";
      for (const [id, src, time] of requested) {
        if (controller.signal.aborted) return;
        if (values[id]) continue;
        if (failedSources.has(src)) continue;
        try {
          if (source !== src) {
            await waitFor("loadedmetadata", () => {
              video.src = src;
              video.load();
            });
            source = src;
          }
          const target = Math.min(Math.max(0, Number(time)), Math.max(0, video.duration - 0.04));
          if (Math.abs(video.currentTime - target) > 0.04 || video.readyState < 2) {
            await waitFor("seeked", () => {
              video.currentTime = target;
            });
          }
          context.fillStyle = "#0a0e1b";
          context.fillRect(0, 0, 128, 72);
          const scale = Math.min(128 / video.videoWidth, 72 / video.videoHeight);
          const width = video.videoWidth * scale,
            height = video.videoHeight * scale;
          context.drawImage(video, (128 - width) / 2, (72 - height) / 2, width, height);
          values[id] = canvas.toDataURL("image/jpeg", 0.65);
          thumbnailCache.set(JSON.stringify([src, time]), values[id]);
          if (thumbnailCache.size > 24) thumbnailCache.delete(thumbnailCache.keys().next().value);
          if (!controller.signal.aborted) setImages({ signature, values: { ...values } });
        } catch (error) {
          if (controller.signal.aborted) return;
          setSampling({ error: error.message, time });
          failedSources.add(src);
          // Keep clip labels and seeking usable when a source cannot be sampled.
        }
      }
      video.removeAttribute("src");
      video.load();
      video.remove();
    })();
    return () => {
      controller.abort();
      video.removeAttribute("src");
      video.load();
      video.remove();
    };
  }, [signature]);
  return (
    <span
      className="pro-source-filmstrip"
      aria-hidden="true"
      data-sampling-error={sampling.error}
      data-sampling-time={sampling.time}
    >
      {sampled.map(frame =>
        images.signature === signature && images.values[frame.id] ? (
          <span
            key={frame.id}
            className="pro-source-frame"
            style={{
              left: `${frame.left}%`,
              width: `${frame.width}%`,
              backgroundImage: `url(${images.values[frame.id]})`,
            }}
          >
            <img src={images.values[frame.id]} alt="" data-source-time={frame.previewTime} />
          </span>
        ) : null
      )}
    </span>
  );
}
