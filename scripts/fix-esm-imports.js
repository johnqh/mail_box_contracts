#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

/**
 * Walk directory recursively and find all .js files
 */
function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath, callback);
    } else if (path.extname(file) === '.js') {
      callback(filePath);
    }
  });
}

/**
 * Fix ESM imports by adding .js extensions
 */
function fixEsmImports(dir) {
  const files = [];
  
  walkDir(dir, (filePath) => {
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    
    // Fix relative imports without extensions
    content = content.replace(
      /from\s+['"](\.[^'"]*?)(['"])/g,
      (match, importPath, quote) => {
        // Don't add extension if it already has one
        if (path.extname(importPath)) {
          return match;
        }
        modified = true;
        return `from ${quote}${importPath}.js${quote}`;
      }
    );
    
    // Fix export from statements
    content = content.replace(
      /export\s+.*?\s+from\s+['"](\.[^'"]*?)(['"])/g,
      (match, importPath, quote) => {
        // Don't add extension if it already has one
        if (path.extname(importPath)) {
          return match;
        }
        modified = true;
        return match.replace(importPath + quote, importPath + '.js' + quote);
      }
    );
    
    if (modified) {
      fs.writeFileSync(filePath, content);
      files.push(filePath);
    }
  });
  
  console.log(`✅ Fixed ESM imports in ${files.length} files`);
}

// Fix ESM imports in the unified ESM build
if (fs.existsSync('dist/unified-esm')) {
  fixEsmImports('dist/unified-esm');
} else {
  console.log('❌ dist/unified-esm directory not found');
}