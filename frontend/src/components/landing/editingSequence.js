// One score drives the opening film and the scroll-controlled product story.
// The demo illustrates editing; it never sends commands to the real editor.
export const SEQUENCE_DURATION = 24;
export const EDITING_CHAPTERS = [
  {
    time: 2.8,
    title: "Bring every angle.",
    label: "Camera sources",
    copy: "Your host, your guest, your wider view. One conversation, with room for every perspective.",
  },
  {
    time: 8.5,
    title: "Find the same beat.",
    label: "Clean audio sync",
    copy: "Bring your camera audio and recorder track into alignment. Keep the clean recording at the heart of the edit.",
  },
  {
    time: 10.8,
    title: "Follow the conversation.",
    label: "Content analysis",
    copy: "Watch the active speaker come forward. Explore shots, audio and suggested moments together.",
  },
  {
    time: 12.2,
    title: "Get a second perspective.",
    label: "Director suggestions",
    copy: "Review proposed split and trim edits. Your approval comes before any change to the project.",
  },
  {
    time: 15,
    title: "Make the cut yours.",
    label: "Build the timeline",
    copy: "Shape the cuts, captions and B-roll in the editor. The story stays in your hands.",
  },
  {
    time: 17,
    title: "Pick the moment.",
    label: "Clip discovery",
    copy: "Highlight a promising section. Choose the hook and the takeaway you want to share.",
  },
  {
    time: 20,
    title: "Change the frame.",
    label: "Vertical reframe",
    copy: "Take your selected moment from a horizontal edit to a vertical social cut.",
  },
  {
    time: 24,
    title: "Give it a new audience.",
    label: "Social export",
    copy: "Review the final version, then prepare your video for TikTok, YouTube Shorts or Instagram Reels.",
  },
];

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}
export function ease(value) {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
}
export function cue(time, start, end) {
  return ease((time - start) / (end - start));
}
export function chapterAt(time) {
  for (let index = EDITING_CHAPTERS.length - 1; index >= 0; index--) {
    if (time >= EDITING_CHAPTERS[index].time) return index;
  }
  return 0;
}
export function scrollSequenceTime(progress) {
  // Browser scroll offsets are rounded to pixels; the final chapter must still finish.
  if (progress >= 0.999) return SEQUENCE_DURATION;
  let scaled = clamp(progress) * (EDITING_CHAPTERS.length - 1);
  const nearestChapter = Math.round(scaled);
  if (Math.abs(scaled - nearestChapter) < 0.002) scaled = nearestChapter;
  const index = Math.min(EDITING_CHAPTERS.length - 2, Math.floor(scaled));
  return (
    EDITING_CHAPTERS[index].time +
    (EDITING_CHAPTERS[index + 1].time - EDITING_CHAPTERS[index].time) * (scaled - index)
  );
}
