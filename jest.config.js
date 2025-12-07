module.exports = {
  projects: [
    {
      displayName: 'server',
      testEnvironment: 'node',
      // Keep jest-focused tests only; exclude legacy Node-style scripts in test/ top-level
      testMatch: ['<rootDir>/src/**/__tests__/**', '<rootDir>/src/**/*.test.js', '<rootDir>/test/**/__tests__/**', '<rootDir>/test/**/*.jest.test.js'],
      // Load early env setup before any modules are imported to ensure bypass flags are present
      setupFiles: ['<rootDir>/test/jest.setup.js'],
      setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
      transform: {
        '^.+\\.[tj]sx?$': 'babel-jest'
      },
      transformIgnorePatterns: ['/node_modules/'],
      testTimeout: 20000
    },
    {
      displayName: 'frontend',
      // Use node environment unless jest-environment-jsdom is available; this avoids validation errors during CI.
      testEnvironment: process.env.JEST_FORCE_NODE_ENV === '1' ? 'node' : 'jsdom',
      testMatch: ['<rootDir>/frontend/src/**/__tests__/**'],
      setupFilesAfterEnv: ['<rootDir>/frontend/src/setupTests.js'],
      moduleNameMapper: {
        '\\.(css|less|scss|sass)$': '<rootDir>/test/__mocks__/styleMock.js',
        '\\.(gif|ttf|eot|svg|png|jpg|jpeg)$': '<rootDir>/test/__mocks__/fileMock.js'
      },
      transform: {
        '^.+\\.[tj]sx?$': 'babel-jest'
      },
      testTimeout: 20000,
      transformIgnorePatterns: ['/node_modules/']
    }
  ],
  // Global config used when running top-level tests
  testPathIgnorePatterns: ['test/e2e/playwright/'],
  verbose: true
};
