// Title animation follows the edit clock, including paused scrubbing and exit.
export function titleAnimationPose(overlay, time) {
  const start = Number(overlay.startTime ?? overlay.start_time ?? 0);
  const duration = Math.max(0.05, Number(overlay.duration ?? 3));
  const animation = overlay.animation || {};
  const ease = progress => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;
  const pose = { opacity: 1, scale: 1, x: 0, y: 0 };
  const apply = (type, progress) => {
    const remaining = 1 - ease(progress);
    if (!type || type === "none") return;
    pose.opacity *= 1 - remaining;
    if (type === "zoom") pose.scale *= 0.7 + 0.3 * (1 - remaining);
    if (type === "slideLeft") pose.x -= 10 * remaining;
    if (type === "slideRight") pose.x += 10 * remaining;
    if (type === "slideUp") pose.y -= 10 * remaining;
    if (type === "slideDown") pose.y += 10 * remaining;
  };
  apply(animation.enter, (time - start) / Math.max(0.001, Number(animation.enterDuration ?? 0.3)));
  apply(animation.exit, (start + duration - time) / Math.max(0.001, Number(animation.exitDuration ?? 0.3)));
  return pose;
}
