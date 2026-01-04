const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

const repoRoot = path.join(__dirname, "..", "..");
const imagesDir = path.join(repoRoot, "facebook_app_review");
const imgs = ["policy_bundle.png", "host_inventory.png", "server_patch_log.png"]
  .map(f => path.join(imagesDir, f))
  .filter(p => fs.existsSync(p));

if (imgs.length === 0) {
  console.error("No images found in", imagesDir);
  process.exit(1);
}

const outDir = path.join(repoRoot, "evidence", "highlighted_pdfs");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "mfa-account-protection-evidence.pdf");

const doc = new PDFDocument({ autoFirstPage: false });
const outStream = fs.createWriteStream(outPath);
doc.pipe(outStream);

// cover page
doc.addPage({ size: "A4", margin: 50 });
doc
  .fontSize(14)
  .fillColor("black")
  .text("MFA / Account Protection - Implementation Evidence", { align: "left" });
doc.moveDown();
doc
  .fontSize(10)
  .text(
    'Cover note: This PDF contains implementation screenshots that demonstrate MFA/account protection enforcement or related policy pages. The reviewer should look for settings such as "Require MFA", "2FA enabled", or a 2-factor login prompt.',
    { align: "left" }
  );
doc.moveDown();
doc.text("Files included:", { underline: true });
imgs.forEach(i => doc.text("- " + path.basename(i)));

// embed images as separate pages
for (const img of imgs) {
  try {
    const { width, height } = doc.page || { width: 595.28, height: 841.89 };
    doc.addPage({ size: "A4", margin: 50 });
    // place image fitting within page bounds
    doc.image(img, {
      fit: [doc.page.width - 100, doc.page.height - 120],
      align: "center",
      valign: "center",
    });
    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor("gray")
      .text("Source file: " + path.basename(img), { align: "left" });
  } catch (err) {
    console.error("Error embedding image", img, err.message);
  }
}

doc.end();

outStream.on("finish", () => {
  console.log("Wrote combined MFA evidence:", outPath);
  const downloadsRoot = path.join("C:", "Users", "asus", "Downloads");
  const uploadFolder = path.join(downloadsRoot, "AutoPromote_Facebook_Evidence");
  if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });
  const dest = path.join(uploadFolder, "mfa-account-protection-evidence.pdf");
  const destRoot = path.join(downloadsRoot, "mfa-account-protection-evidence.pdf");
  try {
    fs.copyFileSync(outPath, dest);
    fs.copyFileSync(outPath, destRoot);
    console.log("Copied to:", dest);
    console.log("Also copied to:", destRoot);
  } catch (err) {
    console.error("Error copying combined pdf:", err.message);
    process.exit(1);
  }
});
