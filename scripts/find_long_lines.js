const fs = require("fs");
const path = process.argv[2] || "autopromote-functions/index.js";
const max = parseInt(process.argv[3] || "120", 10);
const s = fs.readFileSync(path, "utf8").split("\n");
let found = false;
s.forEach((l, i) => {
  if (l.length > max) {
    console.log(`${path}:${i + 1}:${l.length}: ${l}`);
    found = true;
  }
});
if (!found) console.log("No long lines >", max);
