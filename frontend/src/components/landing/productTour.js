export const PRODUCT_TOUR = {
  src: "/landing/product-tour-l40s.mp4",
  poster: "/landing/product-tour-l40s.webp",
  captions: "/landing/product-tour-l40s.vtt",
  duration: 36,
  chapters: [
    { id: "uploads", title: "Uploads", start: 0, copy: "Bring in your footage. Choose where the story goes." },
    { id: "studio", title: "Studio", start: 9, copy: "Play it back. Make the cut. Keep creative control." },
    { id: "schedule", title: "Schedule", start: 18, copy: "See what is queued and plan your next release." },
    { id: "analytics", title: "Analytics", start: 27, copy: "Explore views, clicks and performance by platform." },
  ],
};

export function chapterAtTime(time) {
  return PRODUCT_TOUR.chapters.reduce((active, chapter, index) => time >= chapter.start ? index : active, 0);
}
