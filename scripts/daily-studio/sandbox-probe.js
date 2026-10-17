// Exercise the real user-service environment without a model/API call. An IDE
// terminal can inherit different AppArmor permissions and is not a valid proxy.
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

module.exports = function sandboxProbe(codex, root) {
  const inside = path.join(root, "reports/daily-studio", `sandbox-write-${process.pid}.private`);
  const outside = path.join(os.homedir(), `autopromote-outside-probe-${process.pid}`);
  const program = `const fs=require('fs');const inside=${JSON.stringify(inside)},outside=${JSON.stringify(outside)};
    fs.writeFileSync(inside,'workspace probe',{flag:'wx'});fs.unlinkSync(inside);
    try{fs.writeFileSync(outside,'boundary probe',{flag:'wx'});fs.unlinkSync(outside);throw Error('Outside workspace write allowed');}
    catch(e){if(!['EACCES','EPERM','EROFS'].includes(e.code))throw e;}
    console.log('WORKSPACE_WRITE_OK_OUTSIDE_WRITE_DENIED');`;
  const result = spawnSync(
    "systemd-run",
    [
      "--user",
      "--wait",
      "--pipe",
      "--collect",
      `--unit=autopromote-sandbox-probe-${process.pid}-${Date.now()}`,
      `--working-directory=${root}`,
      "--property=RuntimeMaxSec=20",
      codex,
      "sandbox",
      "-c",
      'sandbox_mode="workspace-write"',
      "-c",
      "sandbox_workspace_write.network_access=true",
      "--",
      process.execPath,
      "-e",
      program,
    ],
    { cwd: root, encoding: "utf8", timeout: 25000 }
  );
  const passed =
    result.status === 0 && result.stdout.includes("WORKSPACE_WRITE_OK_OUTSIDE_WRITE_DENIED");
  const record = {
    at: new Date().toISOString(),
    serviceContext: true,
    modelCalls: 0,
    passed,
    workspaceWrite: passed,
    outsideWriteDenied: passed,
    exitCode: result.status,
    detail: passed
      ? null
      : (result.stderr || result.error?.message || "Sandbox probe failed").slice(-1500),
  };
  const file = path.join(root, "reports/daily-studio/sandbox-preflight.private.json");
  fs.writeFileSync(file, JSON.stringify(record, null, 2), { mode: 0o600 });
  if (!passed)
    throw Error(
      "WAITING_RUNTIME: the systemd user service cannot enforce its workspace sandbox. " +
        (/uid map: Permission denied/.test(record.detail)
          ? "Ubuntu denied bubblewrap user-namespace mapping; load the prepared distro AppArmor profile. "
          : "") +
        "See scripts/daily-studio/sandbox-prerequisite.sh and reports/daily-studio/README.md. No model run was started."
    );
  return record;
};
