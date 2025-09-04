module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'quotes': ['error', 'single'],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'artifacts/',
    'cache/',
    'typechain-types/',
    'target/',
    'test-ledger/',
    'scripts/update-deployed.js',
  ],
  env: {
    node: true,
    es6: true,
    mocha: true,
  },
  overrides: [
    {
      files: ['*.js'],
      parser: 'espree',
      env: {
        node: true,
      },
    },
  ],
};