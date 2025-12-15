// scripts/require-all-src.js
// Require every .js file under src to surface syntax/runtime import errors.
const glob = require("glob");
const path = require("path");

const files = glob.sync("src/**/*.js");
let failed = false;
console.log("Requiring", files.length, "files under src/");
for (const f of files) {
  const abs = path.resolve(f);
  try {
    require(abs);
    console.log("OK ", f);
  } catch (err) {
    failed = true;
    console.error("ERROR", f);
    console.error(err && err.stack ? err.stack : err);
  }
}
if (failed) process.exitCode = 1;
else console.log("ALL OK");
