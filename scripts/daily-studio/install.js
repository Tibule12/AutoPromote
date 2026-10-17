#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "../.."),
  units = path.join(os.homedir(), ".config/systemd/user");
const q = s => '"' + s.replace(/[%"\\]/g, char => (char === "%" ? "%%" : "\\" + char)) + '"';
if (!process.argv.includes("--install"))
  throw Error("Use --install to enable the explicitly requested daily work");
fs.mkdirSync(units, { recursive: true });
const service = `[Unit]\nDescription=AutoPromote daily Studio production and destination scheduling\nAfter=network-online.target\nWants=network-online.target\n\n[Service]\nType=oneshot\nWorkingDirectory=${root.replaceAll("%", "%%")}\nExecStart=${q(process.execPath)} ${q(path.join(__dirname, "run.js"))} --run\nUMask=0077\nEnvironment=TZ=Africa/Johannesburg\nEnvironment=PATH=/usr/local/bin:/usr/bin:/bin\nTimeoutStartSec=3h5min\nTimeoutStopSec=45s\nKillMode=control-group\nNice=10\nMemoryMax=8G\nTasksMax=512\nStandardOutput=journal\nStandardError=journal\n`;
const timer = `[Unit]\nDescription=Run AutoPromote daily creative work and recover saved progress\n\n[Timer]\nOnCalendar=*-*-* 04:00:00 Africa/Johannesburg\nOnCalendar=*-*-* 10:00:00 Africa/Johannesburg\nOnCalendar=*-*-* 16:00:00 Africa/Johannesburg\nPersistent=true\nAccuracySec=1min\nUnit=autopromote-daily-studio.service\n\n[Install]\nWantedBy=timers.target\n`;
for (const [name, contents] of [
  ["autopromote-daily-studio.service", service],
  ["autopromote-daily-studio.timer", timer],
]) {
  const file = path.join(units, name);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== contents)
    throw Error("Preserve existing unit; inspect before changing " + file);
  fs.writeFileSync(file, contents, { mode: 0o600 });
}
execFileSync(
  "systemd-analyze",
  [
    "--user",
    "verify",
    path.join(units, "autopromote-daily-studio.service"),
    path.join(units, "autopromote-daily-studio.timer"),
  ],
  { stdio: "inherit" }
);
execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
execFileSync("systemctl", ["--user", "enable", "--now", "autopromote-daily-studio.timer"], {
  stdio: "inherit",
});
console.log(
  execFileSync(
    "systemctl",
    [
      "--user",
      "show",
      "autopromote-daily-studio.timer",
      "-p",
      "ActiveState",
      "-p",
      "NextElapseUSecRealtime",
      "-p",
      "LastTriggerUSec",
    ],
    { encoding: "utf8" }
  )
);
