const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createRequire } = Module;
const root = path.resolve(__dirname, "../..");
const frontendRequire = createRequire(path.join(root, "frontend/package.json"));

// The installed legacy ESLint uses a callable brace-expansion export.
// Adapt the export in this process; no dependency files are changed.
const original = Module._load;
Module._load = function (name, ...args) {
  const result = original.call(this, name, ...args);
  return name === "brace-expansion" &&
    typeof result !== "function" &&
    typeof result.expand === "function"
    ? Object.assign(result.expand, result)
    : result;
};

async function main() {
  process.chdir(path.join(root, "frontend"));
  const { ESLint } = frontendRequire("eslint");
  const files = [
    "src/WelcomePage.js",
    ...fs
      .readdirSync("src/components/landing")
      .filter(file => file.endsWith(".js"))
      .map(file => `src/components/landing/${file}`),
    "src/__tests__/LandingPageClaims.test.js",
    "src/__tests__/PublicPages.copy.test.js",
    "src/__tests__/LandingMotionLifecycle.test.js",
    "src/__tests__/MotionAssetLayer.test.js",
    "scripts/preview-public-homepage.js",
    "../test/e2e/playwright/run-public-homepage.js",
    "../test/e2e/playwright/run-public-homepage-headline.js",
    "../test/e2e/playwright/run-public-homepage-media.js",
  ];
  const eslint = new ESLint({
    useEslintrc: false,
    overrideConfigFile: ".eslintrc.js",
    overrideConfig: { env: { jest: true } },
  });
  const results = await eslint.lintFiles(files);
  const receipt = {
    files: results.length,
    errorCount: results.reduce((count, result) => count + result.errorCount, 0),
    warningCount: results.reduce((count, result) => count + result.warningCount, 0),
    results: results.map(result => ({
      file: path.relative(root, result.filePath),
      messages: result.messages,
    })),
  };
  fs.writeFileSync(path.join(__dirname, "lint.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `Checked ${receipt.files} files: ${receipt.errorCount} errors, ${receipt.warningCount} warnings`
  );
  if (receipt.errorCount || receipt.warningCount) process.exitCode = 1;
}
main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
