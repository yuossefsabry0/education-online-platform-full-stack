// Shared Jest configuration.
// - Unit tests (tests/unit) exercise individual functions/modules without a DB.
// - Integration tests (tests/integration) use supertest against the Express
//   app and a SEPARATE test database (see tests/setup/globalSetup.js).
// --runInBand keeps a single worker so the shared test DB is never accessed
// concurrently from multiple Jest test files.
module.exports = {
  testEnvironment: "node",
  setupFiles: ["<rootDir>/tests/setup/env.js"],
  globalSetup: "<rootDir>/tests/setup/globalSetup.js",
  globalTeardown: "<rootDir>/tests/setup/globalTeardown.js",
  testMatch: ["<rootDir>/tests/**/*.test.js"],
  verbose: true,
  maxWorkers: 1,
  collectCoverage: false,
  coverageThreshold: {
    global: {
      statements: 75,
      branches: 55,
      functions: 85,
      lines: 80,
    },
  },
};