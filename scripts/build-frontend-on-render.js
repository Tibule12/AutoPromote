const { spawnSync } = require("child_process");

const isRender =
  process.env.RENDER === "true" || Boolean(process.env.RENDER_SERVICE_ID);

if (!isRender) {
  console.log("Skipping frontend postinstall build outside Render.");
  process.exit(0);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const run = args => {
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
};

console.log("Render detected: installing and building the production frontend.");
run(["--prefix", "frontend", "ci"]);
run(["--prefix", "frontend", "run", "build"]);
