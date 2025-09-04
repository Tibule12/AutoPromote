#!/usr/bin/env node

/**
 * GitHub Pages API URL Fix Script
 * 
 * This script scans the built JavaScript files and replaces any instances of
 * "/api/" with the full backend URL.
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

// Fix API URLs in a file
function fixApiUrls(filePath) {
  console.log(`Processing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace "/api/" with the full backend URL
  const newContent = content.replace(/["']\/api\//g, `"${BACKEND_URL}/api/`);
  
  // Replace "https://tibule12.github.io/api/" with the full backend URL
  const githubPagesFixed = newContent.replace(/["']https:\/\/tibule12\.github\.io\/api\//g, `"${BACKEND_URL}/api/`);
  
  // Only write the file if it was changed
  if (content !== githubPagesFixed) {
    fs.writeFileSync(filePath, githubPagesFixed);
    console.log(`✅ Fixed API URLs in ${filePath}`);
    return true;
  }
  
  return false;
}

// Main function
function main() {
  console.log('🔍 Finding JS files in the docs directory...');
  const jsFiles = findJsFiles(DOCS_DIR);
  console.log(`Found ${jsFiles.length} JS files.`);
  
  let fixedCount = 0;
  for (const file of jsFiles) {
    if (fixApiUrls(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n✅ Fixed API URLs in ${fixedCount} out of ${jsFiles.length} files.`);
  console.log(`\n🚀 Deploy the updated files to GitHub Pages to see the changes.`);
}

main();
