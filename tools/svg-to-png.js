const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

async function convert(svgPath, outPath, width = 1200) {
  const svg = fs.readFileSync(svgPath);
  await sharp(svg).resize({ width }).png({ compressionLevel: 9 }).toFile(outPath);
  console.log("Wrote", outPath);
}

async function main() {
  const base = path.join(__dirname, "..", "facebook_app_review");
  const files = [
    { in: "evidence_screenshot_server_patch_log.svg", out: "server_patch_log.png" },
    { in: "evidence_screenshot_host_inventory.svg", out: "host_inventory.png" },
    { in: "evidence_screenshot_policy_bundle.svg", out: "policy_bundle.png" },
  ];
  for (const f of files) {
    const inP = path.join(base, f.in);
    const outP = path.join(base, f.out);
    if (!fs.existsSync(inP)) {
      console.error("Missing input", inP);
      continue;
    }
    try {
      await convert(inP, outP);
    } catch (err) {
      console.error("Failed to convert", inP, err);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
