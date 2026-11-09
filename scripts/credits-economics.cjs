const fs = require("fs");
const { analyseEconomics } = require("../src/services/unifiedCredits/economics");
if (!process.argv[2]) {
  console.error("Usage: node scripts/credits-economics.cjs observation.json");
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(analyseEconomics(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))), null, 2)
  );
}
