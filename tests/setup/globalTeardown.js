// Jest globalTeardown hook: leaves the test database in place for debugging
// (test data is regenerated on every run). Disconnects any lingering client.

module.exports = async () => {
  // prisma client pools are managed per test file; nothing global to do here.
  // The test database is intentionally NOT dropped so failed runs can be
  // inspected - globalSetup recreates it on the next run anyway.
};