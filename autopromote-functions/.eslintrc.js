module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
  },
  extends: ["eslint:recommended", "google", "prettier"],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    // Allow longer lines in server code (URLs, long templates) and ignore strings/template literals
    // Relax max line length enforcement in server code to reduce noise
    "max-len": [
      "off",
      { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true },
    ],
    // Server functions often have top-level helpers without JSDoc; disable strict JSDoc enforcement
    "require-jsdoc": "off",
    // Relax some rules that are noisy for a large legacy server codebase
    "valid-jsdoc": "off",
    "no-unused-vars": "off",
    // Prefer-const is valuable but produces many trivial errors in legacy code; disable for now
    "prefer-const": "off",
    // Disable new-cap as routes/registers often use upper-case named functions invoked directly
    "new-cap": "off",
    "one-var": "off",
    camelcase: "off",
    "no-useless-escape": "off",
    // Allow console for server-side diagnostics
    "no-console": "off",
  },
  overrides: [
    {
      files: ["**/*.spec.*"],
      env: {
        mocha: true,
      },
      rules: {},
    },
  ],
  globals: {},
};
