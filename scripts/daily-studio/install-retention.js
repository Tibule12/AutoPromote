#!/usr/bin/env node
// Explicit installation for the owner's requested 24-hour published-copy cleanup.
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  { execFileSync } = require("node:child_process");
if (!process.argv.includes("--install")) throw Error("Use --install");
const root = path.resolve(__dirname, "../.."),
  units = path.join(os.homedir(), ".config/systemd/user");
const q = value =>
  '"' + value.replace(/[%"\\]/g, char => (char === "%" ? "%%" : "\\" + char)) + '"';
const service = `[Unit]\nDescription=Remove opted-in published video copies after 24 hours\nAfter=network-online.target\n\n[Service]\nType=oneshot\nWorkingDirectory=${root}\nExecStart=${q(process.execPath)} ${q(path.join(__dirname, "cleanup-published.js"))} --apply\nUMask=0077\nTimeoutStartSec=8min\nNice=10\nMemoryMax=512M\n`;
const timer = `[Unit]\nDescription=Check confirmed published-video retention every ten minutes\n\n[Timer]\nOnCalendar=*:0/10\nPersistent=true\nUnit=autopromote-published-retention.service\n\n[Install]\nWantedBy=timers.target\n`;
fs.mkdirSync(units, { recursive: true });
for (const [name, text] of [
  ["autopromote-published-retention.service", service],
  ["autopromote-published-retention.timer", timer],
]) {
  const file = path.join(units, name);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") !== text)
    throw Error("Inspect existing unit before replacing: " + name);
  fs.writeFileSync(file, text, { mode: 0o600 });
}
execFileSync(
  "systemd-analyze",
  [
    "--user",
    "verify",
    path.join(units, "autopromote-published-retention.service"),
    path.join(units, "autopromote-published-retention.timer"),
  ],
  { stdio: "inherit" }
);
execFileSync("systemctl", ["--user", "daemon-reload"], { stdio: "inherit" });
execFileSync("systemctl", ["--user", "enable", "--now", "autopromote-published-retention.timer"], {
  stdio: "inherit",
});
