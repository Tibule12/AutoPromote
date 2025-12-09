module.exports = {
  env: {
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended'
  ],
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    'no-empty': ['warn', { 'allowEmptyCatch': true }],
    'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }]
  },
  overrides: [
    {
      files: ['test/**/*', '**/__tests__/**/*'],
      rules: {
          // Disallow declaring variables in try blocks where they might be used outside the block
          // This helps prevent the 'ReferenceError: variable is not defined' scoping issue in tests.
          // Set to 'warn' so the team receives guidance without blocking CI while fixes are completed.
          'no-restricted-syntax': [
            'warn',
            {
              selector: "TryStatement BlockStatement VariableDeclaration",
              message: 'Avoid declaring variables inside try blocks if they are referenced outside; declare them in the containing scope instead.'
            }
          ],
          'no-empty': ['error', { 'allowEmptyCatch': true }],
          'no-unused-vars': ['warn', { 'argsIgnorePattern': '^_' }]
        }
    }
      ,
      {
        files: ['test/e2e/**/*', 'test/e2e/**/playwright/**/*.js'],
        env: {
          browser: true,
          node: true,
          jest: true
        },
        globals: {
          document: 'readonly',
          window: 'readonly'
        }
      }
  ],
};
