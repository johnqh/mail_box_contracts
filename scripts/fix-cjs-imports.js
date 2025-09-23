import fs from 'fs';
import path from 'path';

/**
 * Post-processes CommonJS build files to remove .js extensions from require statements
 * This is needed because ESM source files have .js extensions for compatibility,
 * but CommonJS require() statements should not include extensions.
 */

function fixCjsImports(dir) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // Recursively process subdirectories
      fixCjsImports(filePath);
    } else if (file.endsWith('.js')) {
      // Process JavaScript files
      const content = fs.readFileSync(filePath, 'utf8');

      // Remove .js extensions from require statements
      // First handle ./relative/path.js patterns
      let updatedContent = content.replace(/require\(["']\.\/([^"']+)\.js["']\)/g, 'require("./$1")');

      // Then handle relative imports without explicit ./ prefix
      updatedContent = updatedContent.replace(/require\(["']([^"'./][^"']*?)\.js["']\)/g, (match, path) => {
        // Only modify if it's a relative import and not a node_modules import
        if (!path.includes('node_modules') && !path.startsWith('@')) {
          return `require("${path}")`;
        }
        return match;
      });

      if (content !== updatedContent) {
        fs.writeFileSync(filePath, updatedContent, 'utf8');
        console.log(`✅ Fixed CJS imports in ${filePath}`);
      }
    }
  }
}

// Process the CommonJS build directory
const cjsDir = './dist/unified';
if (fs.existsSync(cjsDir)) {
  console.log('🔧 Fixing CommonJS imports...');

  // Create package.json to mark this directory as CommonJS
  const packageJson = {
    type: 'commonjs'
  };
  fs.writeFileSync(path.join(cjsDir, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8');
  console.log('✅ Created CommonJS package.json');

  fixCjsImports(cjsDir);
  console.log('✅ CommonJS imports fixed');
} else {
  console.log('⚠️  CommonJS build directory not found');
}