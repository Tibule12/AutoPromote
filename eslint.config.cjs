module.exports = [
  {
    files: ["**/*.js", "**/*.jsx"],
    ignores: ["node_modules/**", "dist/**"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {},
    // Note: do not use 'extends' in flat config; keep minimal rules for CI
    rules: {
      // allow console in server code for now (temporary)
      "no-console": "off",
      "no-unused-vars": "warn"
    }
  }
];
