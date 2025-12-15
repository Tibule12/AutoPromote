/**
 * This script fixes GitHub Pages deployment by updating the URLs in the build output
 * to use absolute paths to the backend API instead of relative paths.
 */

const fs = require("fs");
const path = require("path");

// Configuration
const buildDir = path.join(__dirname, "frontend", "build");
const docsDir = path.join(__dirname, "frontend", "docs");
const backendUrl = "https://autopromote.onrender.com"; // Update this to your backend URL

// Check if build directory exists
if (!fs.existsSync(buildDir)) {
  console.error("Build directory not found. Run npm run build first.");
  process.exit(1);
}

// Function to recursively find .js files
function findJsFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      findJsFiles(filePath, fileList);
    } else if (file.endsWith(".js") || file.endsWith(".js.map")) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Function to fix API URLs in a file
function fixApiUrls(filePath) {
  console.log(`Processing: ${filePath}`);
  let content = fs.readFileSync(filePath, "utf8");

  // Replace relative API URLs with absolute URLs
  let replacements = 0;

  // Fix fetch('/api/...') to fetch('https://autopromote.onrender.com/api/...')
  replacements += (content.match(/fetch\(['"]\/api\//g) || []).length;
  content = content.replace(/fetch\(['"]\/api\//g, `fetch('${backendUrl}/api/`);

  // Fix axios.get('/api/...') to axios.get('https://autopromote.onrender.com/api/...')
  replacements += (content.match(/axios\.(get|post|put|delete)\(['"]\/api\//g) || []).length;
  content = content.replace(
    /axios\.(get|post|put|delete)\(['"]\/api\//g,
    (match, method) => `axios.${method}('${backendUrl}/api/`
  );

  // Save the modified file
  fs.writeFileSync(filePath, content);

  return replacements;
}

// Process all JS files in the build directory
console.log("Fixing API URLs in build output...");
const jsFiles = findJsFiles(buildDir);
let totalReplacements = 0;

jsFiles.forEach(file => {
  const replacements = fixApiUrls(file);
  totalReplacements += replacements;
});

console.log(`Fixed ${totalReplacements} API URLs in ${jsFiles.length} files.`);

// Copy build directory to docs for GitHub Pages if needed
if (!fs.existsSync(docsDir)) {
  console.log("Creating docs directory for GitHub Pages deployment...");
  fs.mkdirSync(docsDir);
}

console.log("Copying build output to docs directory...");
function copyRecursive(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (exists && isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest);
    }

    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(buildDir, docsDir);

console.log("GitHub Pages deployment fix completed successfully!");
console.log(`Backend API URL: ${backendUrl}`);
console.log("Remember to commit and push the changes to deploy to GitHub Pages.");
