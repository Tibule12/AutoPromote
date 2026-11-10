const { expandDirectorRepeater } = require("./studioDirectorRepeater");
// A reusable transition operator, lowered into the ordinary repeater/scene
// graph. The model chooses intent parameters, never per-frame render code.
function expandFragmentTransition(wire, duration) {
  const f = wire?.fragment;
  const num = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
  if (
    !wire ||
    Object.keys(wire).some(k => !["name", "concept", "fragment"].includes(k)) ||
    !f ||
    Object.keys(f).some(
      k =>
        ![
          "outgoing",
          "incoming",
          "count",
          "axis",
          "background",
          "holdSeconds",
          "fanSeconds",
          "switchSeconds",
          "resolveSeconds",
          "scale",
          "spread",
          "fanDegrees",
          "staggerSeconds",
          "direction",
        ].includes(k)
    ) ||
    !Number.isInteger(f.outgoing) ||
    !Number.isInteger(f.incoming) ||
    f.outgoing === f.incoming ||
    !Number.isInteger(f.count) ||
    !num(f.count, 2, 6) ||
    !["x", "y"].includes(f.axis) ||
    !/^#[a-f\d]{6}$/i.test(f.background || "") ||
    !num(duration, 2, 30) ||
    !num(f.holdSeconds, 0.2, duration * 0.25) ||
    !num(f.fanSeconds, f.holdSeconds + 0.3, duration * 0.45) ||
    !num(f.switchSeconds, f.fanSeconds + 0.4, duration * 0.75) ||
    !num(f.resolveSeconds, f.switchSeconds + 0.4, duration) ||
    !num(f.scale, 0.65, 0.85) ||
    !num(f.spread, 2, 7) ||
    !num(f.fanDegrees, 3, 9) ||
    !num(f.staggerSeconds, 0, 0.08) ||
    !["up", "down", "left", "right"].includes(f.direction)
  )
    throw Error(
      "Fragment transition needs two sources, ordered hold/fan/switch/resolve times, and bounded spread."
    );
  const h = f.holdSeconds / duration,
    a = f.fanSeconds / duration,
    s = f.switchSeconds / duration,
    z = f.resolveSeconds / duration;
  const ready = a + (s - a) * 0.35,
    leave = s + (z - s) * 0.45,
    release = a + (s - a) * 0.62;
  const step = f.axis === "x" ? [f.spread, -1, 0, f.fanDegrees] : [-1, f.spread, 0, f.fanDegrees];
  const pose = (at, x, y, scale, rotation, offsets = step) => [
    at,
    x,
    y,
    scale,
    rotation,
    ...offsets,
  ];
  const assembled = at => pose(at, 50, 50, 1, 0, [0, 0, 0, 0]);
  const exit = { up: [50, -80], down: [50, 180], left: [-80, 50], right: [180, 50] }[f.direction];
  const enter = [100 - exit[0], 100 - exit[1]];
  // Delays are deliberately bounded by the shortest neighbouring key gap so
  // every expanded fragment retains strictly ordered time, even at six copies.
  const stagger = Math.min(
    f.staggerSeconds / duration,
    (ready - a) / (f.count * 2),
    (s - release) / (f.count * 2)
  );
  return expandDirectorRepeater({
    name: wire.name,
    concept: wire.concept,
    background: f.background,
    cameraZoom: 1,
    cameraTurn: 0,
    runs: [
      {
        source: f.outgoing,
        count: f.count,
        axis: f.axis,
        range: [0, leave],
        sourceStart: 0,
        stagger,
        entry: "assembled",
        exit: "free",
        poses: [
          assembled(0),
          assembled(h),
          pose(a, 50, 50, f.scale, 0),
          pose(release, 50, 50, f.scale, 0),
          pose(s, ...exit, f.scale, 0),
          pose(leave, ...exit, f.scale, 0),
        ],
      },
      {
        source: f.incoming,
        count: f.count,
        axis: f.axis,
        range: [ready, 1],
        sourceStart: 0,
        stagger,
        entry: "free",
        exit: "assembled",
        poses: [
          pose(ready, ...enter, f.scale, 0),
          pose(s, 50, 50, f.scale, 0),
          assembled(z),
          ...(z < 1 ? [assembled(1)] : []),
        ],
      },
    ],
  });
}
module.exports = { expandFragmentTransition };
