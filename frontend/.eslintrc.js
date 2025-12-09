module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  rules: {
    // Temporarily relax these rules so we can push fixes incrementally.
    'no-console': 'off',
    'no-unused-vars': 'off'
  }
};
