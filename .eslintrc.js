module.exports = {
  env: {
    browser: false,
    es6: true,
    mocha: true,
    node: true,
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "@openzeppelin/eslint-config-solidity", 
    "@nomicfoundation/eslint-config-hardhat",
    "eslint:recommended",
    "@typescript-eslint/recommended",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  rules: {
    // TypeScript specific
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/prefer-const": "error",
    
    // General JavaScript/Node.js
    "no-console": "off", // Allow console.log for development
    "no-unused-vars": "off", // Use TypeScript version instead
    "prefer-const": "error",
    "no-var": "error",
    
    // Style preferences for AI development
    "object-shorthand": "error",
    "prefer-arrow-callback": "error",
    "prefer-template": "error",
    "quotes": ["error", "single", { avoidEscape: true }],
    "semi": ["error", "always"],
    "comma-dangle": ["error", "es5"],
    
    // Import organization
    "sort-imports": ["error", {
      ignoreCase: false,
      ignoreDeclarationSort: true,
      ignoreMemberSort: false,
      memberSyntaxSortOrder: ["none", "all", "multiple", "single"],
    }],
  },
  overrides: [
    {
      files: ["*.test.ts", "*.spec.ts"],
      rules: {
        // More lenient rules for test files
        "@typescript-eslint/no-explicit-any": "off",
        "no-unused-expressions": "off", // For chai assertions
      },
    },
    {
      files: ["scripts/**/*.ts"],
      rules: {
        // Allow console.log in scripts
        "no-console": "off",
      },
    },
    {
      files: ["hardhat.config.ts"],
      rules: {
        // Special config for Hardhat config
        "@typescript-eslint/no-var-requires": "off",
      },
    },
  ],
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "build/",
    "artifacts/",
    "cache/",
    "typechain-types/",
    "target/",
    "coverage/",
    "*.d.ts",
  ],
};