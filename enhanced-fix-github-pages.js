#!/usr/bin/env node

/**
 * Enhanced GitHub Pages API URL Fix Script
 * 
 * This script scans the built JavaScript files and replaces:
 * 1. Instances of "/api/" with the full backend URL
 * 2. References to "localhost" with the full backend URL
 * 3. Missing environment variables with appropriate values
 */

const fs = require('fs');
const path = require('path');

// Configuration
const DOCS_DIR = path.join(__dirname, 'frontend', 'docs');
const BACKEND_URL = 'https://autopromote.onrender.com';

// Find all JS files in the docs directory
function findJsFiles(dir) {
  const result = [];
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      result.push(...findJsFiles(filePath));
    } else if (file.endsWith('.js') && !file.endsWith('.LICENSE.txt')) {
      result.push(filePath);
    }
  }
  
  return result;
}

// Fix API URLs and localhost references in a file
function fixUrls(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;
  
  // Replace "/api/" with the full backend URL
  const apiFixed = content.replace(/["']\/api\//g, `"${BACKEND_URL}/api/`);
  if (content !== apiFixed) {
    content = apiFixed;
    modified = true;
    console.log(`- Fixed /api/ references`);
  }
  
  // Replace "https://tibule12.github.io/api/" with the full backend URL
  const githubPagesFixed = content.replace(/["']https:\/\/tibule12\.github\.io\/api\//g, `"${BACKEND_URL}/api/`);
  if (content !== githubPagesFixed) {
    content = githubPagesFixed;
    modified = true;
    console.log(`- Fixed github.io/api/ references`);
  }
  
  // Replace "http://localhost:5000" with the full backend URL
  const localhostFixed = content.replace(/["']http:\/\/localhost:5000/g, `"${BACKEND_URL}`);
  if (content !== localhostFixed) {
    content = localhostFixed;
    modified = true;
    console.log(`- Fixed localhost:5000 references`);
  }
  
  // Fix "undefined" environment variables by setting REACT_APP_API_URL
  const envVarFixed = content.replace(/REACT_APP_API_URL:\s*undefined/g, `REACT_APP_API_URL: "${BACKEND_URL}"`);
  if (content !== envVarFixed) {
    content = envVarFixed;
    modified = true;
    console.log(`- Fixed undefined REACT_APP_API_URL`);
  }
  
  // Only write the file if it was changed
  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed URLs in ${filePath}`);
    return true;
  }
  
  return false;
}

// Fix the index.html file to include environment variables
function fixIndexHtml() {
  const indexPath = path.join(DOCS_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    console.log(`❌ index.html not found at ${indexPath}`);
    return false;
  }
  
  console.log(`Processing index.html...`);
  let content = fs.readFileSync(indexPath, 'utf8');
  
  // Add environment variables before the closing </head> tag
  const envVarsScript = `
  <script>
    window.env = {
      REACT_APP_API_URL: "${BACKEND_URL}",
      REACT_APP_FIREBASE_API_KEY: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
      REACT_APP_FIREBASE_AUTH_DOMAIN: "autopromote-464de.firebaseapp.com",
      REACT_APP_FIREBASE_PROJECT_ID: "autopromote-464de"
    };
  </script>`;
  
  if (!content.includes('window.env =')) {
    content = content.replace('</head>', `${envVarsScript}\n</head>`);
    fs.writeFileSync(indexPath, content);
    console.log(`✅ Added environment variables to index.html`);
    return true;
  }
  
  return false;
}

// Main function
function main() {
  console.log('🔍 Finding JS files in the docs directory...');
  
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`❌ Docs directory not found at ${DOCS_DIR}`);
    console.error('Make sure to run npm run build before running this script.');
    process.exit(1);
  }
  
  const jsFiles = findJsFiles(DOCS_DIR);
  console.log(`Found ${jsFiles.length} JS files.`);
  
  let fixedCount = 0;
  for (const file of jsFiles) {
    if (fixUrls(file)) {
      fixedCount++;
    }
  }
  
  // Fix the index.html file
  const indexFixed = fixIndexHtml();
  
  console.log(`\n✅ Fixed URLs in ${fixedCount} out of ${jsFiles.length} files.`);
  if (indexFixed) {
    console.log(`✅ Added environment variables to index.html`);
  }
  console.log(`\n🚀 Deploy the updated files to GitHub Pages to see the changes.`);
}

main();
