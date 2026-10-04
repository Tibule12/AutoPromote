// Editor layer times use the programme clock. Legacy generated caption layers
// used source times. Hook export rearranges source ranges, preserving identity.
export function mapStudioOverlayTiming({ overlays, timeline, exportTimeline, getWindow }) {
  let offset = 0;
  const output = exportTimeline.map(segment => {
    const mapped = { ...segment, offset };
    offset += Number(segment.duration || 0);
    return mapped;
  });
  const locate = time => {
    let elapsed = 0;
    for (let index = 0; index < timeline.length; index++) {
      const clip = timeline[index],
        window = getWindow(clip);
      const duration = Math.max(0, Number(window.duration || 0));
      if (time < elapsed + duration || index === timeline.length - 1) {
        return {
          clip,
          sourceTime: Number(window.start || 0) + Math.max(0, Math.min(duration, time - elapsed)),
        };
      }
      elapsed += duration;
    }
    return null;
  };
  return overlays.map(overlay => {
    const time = overlay.startTime ?? overlay.start_time;
    if (time === undefined || time === null) return { ...overlay };
    const legacySource =
      overlay.timingSpace === "source" ||
      (overlay.isCaption && overlay.timingSpace !== "programme");
    const position = legacySource
      ? {
          clip: timeline.find(clip => clip.id === (overlay.clipId || "main")),
          sourceTime: Number(time),
        }
      : locate(Number(time));
    const clip = position?.clip;
    const candidates = clip
      ? output.filter(
          segment =>
            segment.id === clip.id ||
            segment.id === `hook-intro-${clip.id}` ||
            segment.id === `${clip.id}-before-hook` ||
            segment.id === `${clip.id}-after-hook`
        )
      : [];
    const segment =
      candidates.find(
        item =>
          position.sourceTime >= Number(item.start_time || 0) &&
          position.sourceTime < Number(item.end_time || 0)
      ) || candidates[0];
    return {
      ...overlay,
      start_time: segment
        ? segment.offset + Math.max(0, position.sourceTime - Number(segment.start_time || 0))
        : Math.max(0, Number(time)),
      duration: overlay.duration == null ? overlay.duration : Number(overlay.duration),
    };
  });
}
