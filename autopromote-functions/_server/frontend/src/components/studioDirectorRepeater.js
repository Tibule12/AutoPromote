// Authoring-only repeater: expands index offsets and source partitions into
// ordinary video planes/keys/Parent connections. No alternate playback engine.
function expandDirectorRepeater(wire) {
  const fail = message => {
    throw Error(message);
  };
  const obj = (v, keys) =>
    v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).every(k => keys.includes(k));
  const num = (v, a, b) => typeof v === "number" && Number.isFinite(v) && v >= a && v <= b;
  if (
    !obj(wire, ["name", "concept", "background", "cameraZoom", "cameraTurn", "runs"]) ||
    !/^#[a-f\d]{6}$/i.test(wire.background || "") ||
    !num(wire.cameraZoom, 1, 1.15) ||
    !num(wire.cameraTurn, -8, 8) ||
    !Array.isArray(wire.runs) ||
    !wire.runs.length ||
    wire.runs.length > 3
  )
    fail("Invalid Director video repeater.");
  const nodes = [
      { id: "field", kind: "solid", color: wire.background, poses: [[0, 50, 50, 1, 0, 1]] },
      {
        id: "camera",
        kind: "rig",
        poses: [
          [0, 50, 50, 1, 0, 1],
          [1, 50, 50, wire.cameraZoom, wire.cameraTurn, 1],
        ],
      },
    ],
    links = [];
  let count = 0;
  for (const [r, run] of wire.runs.entries()) {
    let rows = run.poses;
    if (typeof rows === "string") {
      if (rows.length > 1800 || !/^[\d+.,; eE-]+$/.test(rows))
        fail("Invalid compact motion table.");
      rows = rows
        .split(";")
        .map(row => row.split(",").map(cell => (cell.trim() ? Number(cell) : NaN)));
    }
    if (
      !obj(run, [
        "source",
        "count",
        "axis",
        "range",
        "sourceStart",
        "stagger",
        "entry",
        "exit",
        "poses",
      ]) ||
      !Number.isInteger(run.source) ||
      !Number.isInteger(run.count) ||
      !num(run.count, 2, 6) ||
      !["x", "y"].includes(run.axis) ||
      !Array.isArray(run.range) ||
      run.range.length !== 2 ||
      !num(run.range[0], 0, 1) ||
      !num(run.range[1], run.range[0] + 0.1, 1) ||
      !num(run.sourceStart, 0, 3600) ||
      !num(run.stagger, 0, 0.04) ||
      !["assembled", "free"].includes(run.entry) ||
      !["assembled", "free"].includes(run.exit) ||
      !Array.isArray(rows) ||
      rows.length < 2 ||
      rows.length > 6
    )
      fail("A video repeater needs a source, 2–6 partitions, range and ordered motion poses.");
    count += run.count;
    if (count > 12) fail("Use at most twelve moving video fragments.");
    let previous = -1;
    for (const pose of rows) {
      if (
        !Array.isArray(pose) ||
        pose.length !== 9 ||
        !pose.every(Number.isFinite) ||
        !num(pose[0], run.range[0], run.range[1]) ||
        pose[0] <= previous
      )
        fail("Repeater poses need ordered progress and eight finite transform/index values.");
      previous = pose[0];
    }
    for (let i = 0; i < run.count; i++) {
      const index = i - (run.count - 1) / 2;
      const poses = rows.map(p => [
        p[0] === run.range[0] || p[0] === run.range[1] ? p[0] : p[0] + i * run.stagger,
        p[1] + index * p[5],
        p[2] + index * p[6],
        p[3] + index * p[7],
        p[4] + index * p[8],
        1,
      ]);
      // Assembled is a declared authoring operation: exact source partitions
      // share an identity transform at the selected endpoint, with no seams
      // introduced by language-model coordinate arithmetic.
      for (const [flag, time, first] of [
        [run.entry, run.range[0], true],
        [run.exit, run.range[1], false],
      ]) {
        if (flag !== "assembled") continue;
        const pose = [time, 50, 50, 1, 0, 1],
          at = first ? 0 : poses.length - 1;
        if (poses[at][0] === time) poses[at] = pose;
        else if (first) poses.unshift(pose);
        else poses.push(pose);
      }
      const a = (100 * i) / run.count,
        b = (100 * (i + 1)) / run.count;
      const region = run.axis === "x" ? [a, 0, b, 100] : [0, a, 100, b];
      const id = `run_${r + 1}_piece_${i + 1}`;
      nodes.push({
        id,
        kind: "video",
        source: run.source,
        sourceStart: run.sourceStart,
        range: [...run.range],
        region,
        poses,
      });
      links.push({ from: "camera", to: id, port: "Parent" });
    }
  }
  const first = wire.runs[0],
    last = wire.runs.at(-1);
  if (
    first.range[0] !== 0 ||
    first.entry !== "assembled" ||
    last.range[1] !== 1 ||
    last.exit !== "assembled"
  )
    fail(
      "Begin with assembled footage at progress0 and finish with assembled footage at progress1."
    );
  for (let i = 1; i < wire.runs.length; i++)
    if (wire.runs[i].range[0] > wire.runs[i - 1].range[1])
      fail("Keep source runs connected through their handoff.");
  if (
    !nodes
      .slice(2)
      .some(
        (n, i, all) =>
          i > 0 &&
          n.id.split("_piece_")[0] === all[i - 1].id.split("_piece_")[0] &&
          n.poses.some((p, j) =>
            p.slice(1, 5).some((v, k) => Math.abs(v - all[i - 1].poses[j][k + 1]) > 0.01)
          )
      )
  )
    fail("Give the repeated fragments visible independent transform offsets.");
  return { name: wire.name, concept: wire.concept, nodes, links, drivers: [] };
}
module.exports = { expandDirectorRepeater };
