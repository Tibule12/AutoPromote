// Small, local SVGs keep the public page independent of editor/icon bundles.
const paths = {
  pause: "M8 5v14M16 5v14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  play: "m9 5 11 7-11 7V5Z",
  camera: "M15 8l6-3v14l-6-3M3 6h12v12H3V6Z",
  captions: "M4 5h16v14H4V5Zm3 5h3m-3 4h3m4-4h3m-3 4h3",
  audio: "M4 10v4m4-7v10m4-14v18m4-14v10m4-7v4",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z",
  export: "M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6",
  check: "m5 12 4 4L19 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  cut: "m9 9 11 11M9 15 20 4M4 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  upload: "M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4",
};

export default function LandingIcon({ name, className = "" }) {
  return (
    <svg
      className={`lp-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  );
}
