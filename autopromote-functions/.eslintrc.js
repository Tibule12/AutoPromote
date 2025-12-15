module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: ["eslint:recommended", "google", "prettier"],
  rules: {
    "no-restricted-globals": ["error", "name", "length"],
    "prefer-arrow-callback": "error",
    quotes: ["error", "double", { allowTemplateLiterals: true }],
    // Allow longer lines in server code (URLs, long templates) and ignore strings/template literals
    "max-len": [
      "error",
      { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreComments: true },
    ],
    // Server functions often have top-level helpers without JSDoc; disable strict JSDoc enforcement
    "require-jsdoc": "off",
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
