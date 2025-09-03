module.exports = {
  extends: [
    '@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: null, // Disable project reference to avoid parsing issues
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'artifacts/',
    'cache/',
    'typechain-types/',
    'target/',
    'test-ledger/',
    '*.js',
  ],
  env: {
    node: true,
    es6: true,
    mocha: true,
  },
};