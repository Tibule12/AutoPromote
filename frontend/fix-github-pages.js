/**
 * Fix GitHub Pages API URLs
 *
 * This script modifies the JavaScript files in the build directory
 * to replace any relative API URLs (/api/...) with absolute URLs
 * (https://autopromote.onrender.com/api/...)
 */

const fs = require("fs");
const path = require("path");

// Configuration
const buildDir = path.join(__dirname, "build");
const jsDir = path.join(buildDir, "static", "js");
const backendUrl = "https://autopromote.onrender.com";

console.log("Fix GitHub Pages API URLs");
console.log("========================");
console.log(`Backend URL: ${backendUrl}`);
console.log(`Build directory: ${buildDir}`);
console.log(`JavaScript directory: ${jsDir}`);
console.log("");

// Check if the build directory exists
if (!fs.existsSync(buildDir)) {
  console.error("Build directory not found. Run npm run build first.");
  process.exit(1);
}

// Check if the JavaScript directory exists
if (!fs.existsSync(jsDir)) {
  console.error("JavaScript directory not found.");
  process.exit(1);
}

// Find all JavaScript files in the js directory
const jsFiles = fs
  .readdirSync(jsDir)
  .filter(file => file.endsWith(".js") && !file.endsWith(".LICENSE.txt"));

console.log(`Found ${jsFiles.length} JavaScript files.`);

// Process each JavaScript file
let totalReplacements = 0;

jsFiles.forEach(file => {
  const filePath = path.join(jsDir, file);
  console.log(`Processing ${file}...`);

  // Read the file content
  let content = fs.readFileSync(filePath, "utf8");

  // Replace relative API URLs with absolute URLs
  // This regex looks for fetch, axios, or other requests to /api/...
  const relativeApiRegex = /(['"])(\/api\/[^'"]+)(['"])/g;

  // Count the number of replacements
  const replacements = [];
  let match;
  while ((match = relativeApiRegex.exec(content)) !== null) {
    replacements.push({
      full: match[0],
      quote: match[1],
      url: match[2],
      replacement: `${match[1]}${backendUrl}${match[2]}${match[3]}`,
    });
  }

  console.log(`  Found ${replacements.length} relative API URLs.`);

  // Apply replacements
  replacements.forEach(replacement => {
    content = content.replace(replacement.full, replacement.replacement);
    totalReplacements++;
  });

  // Look for GitHub Pages URL patterns - more comprehensive approach
  const githubPagesPatterns = [
    // Direct GitHub Pages URLs
    /https:\/\/tibule12\.github\.io(?:\/AutoPromote)?\/api\//g,

    // String concatenations that would result in GitHub Pages URLs
    /"https:\/\/tibule12\.github\.io(?:\/AutoPromote)?"\s*\+\s*["']\/api\//g,

    // Fetch calls to GitHub Pages with path construction
    /fetch\(\s*["']https:\/\/tibule12\.github\.io(?:\/AutoPromote)?["']\s*\+\s*["']\/api\//g,

    // URLs embedded in JSON strings
    /['"]\s*url['"]\s*:\s*["']https:\/\/tibule12\.github\.io(?:\/AutoPromote)?\/api\/[^"']+["']/g,
  ];

  let githubMatches = 0;

  // Apply each pattern
  githubPagesPatterns.forEach(pattern => {
    const matches = content.match(pattern) || [];
    if (matches.length > 0) {
      console.log(`  Found ${matches.length} matches for pattern: ${pattern}`);

      content = content.replace(pattern, match => {
        return match.replace(
          /https:\/\/tibule12\.github\.io(?:\/AutoPromote)?(?:\/api\/)?/,
          `${backendUrl}/api/`
        );
      });

      githubMatches += matches.length;
    }
  });

  // Special handling for specific endpoints that need fixed absolute URLs
  const criticalEndpoints = [
    {
      pattern: /(['"])\/api\/auth\/register(['"])/g,
      replacement: `$1${backendUrl}/api/auth/register$2`,
    },
    { pattern: /(['"])\/api\/auth\/login(['"])/g, replacement: `$1${backendUrl}/api/auth/login$2` },
    {
      pattern: /(['"])https:\/\/tibule12\.github\.io(?:\/AutoPromote)?\/api\/auth\/register(['"])/g,
      replacement: `$1${backendUrl}/api/auth/register$2`,
    },
    {
      pattern: /(['"])https:\/\/tibule12\.github\.io(?:\/AutoPromote)?\/api\/auth\/login(['"])/g,
      replacement: `$1${backendUrl}/api/auth/login$2`,
    },
  ];

  criticalEndpoints.forEach(endpoint => {
    const endpointMatches = content.match(endpoint.pattern) || [];
    if (endpointMatches.length > 0) {
      console.log(
        `  Found ${endpointMatches.length} instances of critical endpoint: ${endpoint.pattern}`
      );
      content = content.replace(endpoint.pattern, endpoint.replacement);
      githubMatches += endpointMatches.length;
    }
  });

  console.log(`  Found and replaced ${githubMatches} GitHub Pages API URLs.`);
  totalReplacements += githubMatches;

  // Write the modified content back to the file
  fs.writeFileSync(filePath, content);
});

console.log("");
console.log(`Total replacements: ${totalReplacements}`);
console.log("Fix completed successfully.");

console.log("");
console.log(`Total replacements: ${totalReplacements}`);
console.log("Fix completed successfully.");
