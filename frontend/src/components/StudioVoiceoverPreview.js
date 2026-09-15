import React, { useEffect, useRef } from "react";
import { SafeAudio } from "./SafeMedia";
import { voiceoverDuration, voiceoverGain } from "./studioVoiceover";
import { interpolateAutomationValue } from "./studioAutomation";

// Kept outside the inspector: changing tools must never unmount an audible take.
export default function StudioVoiceoverPreview({ takes, videoRef, getTimelineTime, activeClip,
  muted, volume, automationKeyframes = [], renderedOutputUrl, onError }) {
  const elements = useRef(new Map());
  const latest = useRef();
  latest.current = { getTimelineTime, onError };
  useEffect(() => {
    const video = videoRef.current;
    const pause = () => elements.current.forEach(audio => audio.pause());
    if (!video || renderedOutputUrl) { pause(); return undefined; }
    const sync = () => {
      const time = latest.current.getTimelineTime(video.currentTime || 0);
      takes.forEach(take => {
        const audio = elements.current.get(take.id);
        if (!audio) return;
        const elapsed = time - Number(take.startTime || 0);
        const duration = voiceoverDuration(take);
        if (video.paused || take.enabled === false || elapsed < 0 || elapsed >= duration) {
          audio.pause(); return;
        }
        const fade = Math.max(0, Math.min(1,
          take.fadeIn > 0 ? elapsed / take.fadeIn : 1,
          take.fadeOut > 0 ? (duration - elapsed) / take.fadeOut : 1));
        audio.muted = muted;
        const automation = interpolateAutomationValue({ keyframes: automationKeyframes,
          property: "volume", time, fallback: 100 }) / 100;
        audio.volume = voiceoverGain(volume) * voiceoverGain(take.volume) * fade * automation;
        audio.playbackRate = video.playbackRate || 1;
        audio.preservesPitch = true;
        const target = Number(take.trimStart || 0) + elapsed;
        if (Math.abs(audio.currentTime - target) > 0.15) {
          try { audio.currentTime = target; } catch (_) { /* Retry on metadata. */ }
        }
        if (audio.paused) audio.play()?.catch(error => {
          if (error.name !== "AbortError") latest.current.onError?.(`Voice-over playback failed: ${error.message}`);
        });
      });
    };
    const events = ["play", "pause", "ended", "timeupdate", "seeking", "seeked", "ratechange", "loadedmetadata"];
    events.forEach(event => video.addEventListener(event, sync));
    elements.current.forEach(audio => audio.addEventListener("loadedmetadata", sync));
    sync();
    const mounted = [...elements.current.values()];
    return () => {
      events.forEach(event => video.removeEventListener(event, sync));
      mounted.forEach(audio => { audio.removeEventListener("loadedmetadata", sync); audio.pause(); });
    };
  }, [takes, videoRef, activeClip, muted, volume, automationKeyframes, renderedOutputUrl]);
  return takes.filter(take => take.url).map(take => <SafeAudio key={take.id}
    ref={element => element ? elements.current.set(take.id, element) : elements.current.delete(take.id)}
    data-testid={`voiceover-audio-${take.id}`} src={take.url} preload="auto" hidden
    onError={() => latest.current.onError?.(`Reconnect the recording “${take.name}”; its audio could not be loaded.`)} />);
}
