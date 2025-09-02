const js = require('@eslint/js');

module.exports = [
  // Global ignores - these override all other configs
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'artifacts/**',
      'cache/**',
      'typechain-types/**',
      'target/**',
      'coverage/**',
      '**/*.d.ts',
      '.ai/**',
    ]
  },
  
  // JavaScript files
  {
    ...js.configs.recommended,
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      // General JavaScript/Node.js
      'no-console': 'off', // Allow console.log for development
      'prefer-const': 'error',
      'no-var': 'error',
      
      // Style preferences for AI development
      'quotes': ['error', 'single', { avoidEscape: true }],
      'semi': ['error', 'always'],
    },
  },

  // TypeScript files - basic rules only since we don't have TS parser properly configured
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
    },
    rules: {
      // Very basic rules that work without TypeScript parser
      'no-console': 'off',
      'no-unused-vars': 'off', // Will be handled by TypeScript compiler
    },
  },
  
  {
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: {
      // More lenient rules for test files
      'no-unused-expressions': 'off', // For chai assertions
    },
  },
  {
    files: ['scripts/**/*.ts'],
    rules: {
      // Allow console.log in scripts
      'no-console': 'off',
    },
  },
];