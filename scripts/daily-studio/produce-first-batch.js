#!/usr/bin/env node
// Resume the four deliberately authored first-day concepts through normal UI.
// This does not generate filler for future dates or run another model/agent.
const fs = require("node:fs"),
  path = require("node:path"),
  { spawnSync } = require("node:child_process");
const c = require("./contract"),
  root = path.resolve(__dirname, "../.."),
  date = "2026-10-17";
const dir = c.dayRoot(root, date),
  file = path.join(dir, "day.json");
const slugs = ["pacing-contrast", "editable-reveal", "visual-hierarchy", "sound-alignment"];
let book = c.prepare(root, date);
if (book.status === "SCHEDULED_VERIFIED") throw Error("Preserve the completed day");
book.status = "RUNNING";
book.blockers = [];
book.stories = slugs.map(id => {
  const prior = book.stories.find(s => s.id === id);
  if (prior) return prior;
  const d = JSON.parse(fs.readFileSync(path.join(dir, id, "design.json")));
  return {
    id,
    audience: "Editors creating short promotional videos",
    problem: d.problem,
    visualHook: d.hook,
    payoff: d.payoff,
    creativeDifference: d.concept,
    status: "AUTHORING",
    directory: path.relative(root, path.join(dir, id)),
  };
});
c.atomic(file, book);
const selected = process.argv.slice(2);
if (selected.some(id => !slugs.includes(id)))
  throw Error("Choose only an authored first-day story");
for (const id of selected.length ? selected : slugs) {
  const base = path.join(dir, id),
    proof = path.join(base, "proof");
  for (let action of ["setup", "design", "render", "view"]) {
    const done =
      action === "setup"
        ? "setup-project.private.json.gz"
        : action === "design"
          ? "native-design.json"
          : action === "render"
            ? id + "/render-receipt.json"
            : "native-backup.json";
    if (fs.existsSync(path.join(proof, done))) {
      console.log(id, action, "already saved; no resubmission");
      continue;
    }
    if (
      action === "render" &&
      fs.existsSync(path.join(proof, `${id}-render-request.private.json`))
    ) {
      console.log(
        id,
        "previous render request exists; recover through Studio without another submission"
      );
      action = "recover";
    }
    console.log(new Date().toISOString(), id, action);
    const run = spawnSync(
      process.execPath,
      ["scripts/studio-professional/five-words-proof.js", action],
      {
        cwd: root,
        stdio: "inherit",
        env: { ...process.env, STUDIO_MOTION_RUN_DIR: path.relative(root, base) },
      }
    );
    if (run.status !== 0) {
      book = JSON.parse(fs.readFileSync(file));
      book.status = "NEEDS_REVISION";
      book.blockers = [`${id}: ${action} stopped. Reconcile native receipts before retrying.`];
      c.atomic(file, book);
      process.exit(run.status || 1);
    }
  }
  book = JSON.parse(fs.readFileSync(file));
  book.stories.find(s => s.id === id).status = "RENDERED_NEEDS_REVIEW";
  c.atomic(file, book);
}
book = JSON.parse(fs.readFileSync(file));
book.status = book.stories.every(
  s => s.status === "RENDERED_NEEDS_REVIEW" || s.status === "REVIEWED"
)
  ? "NEEDS_REVIEW"
  : "AUTHORING";
c.atomic(file, book);
