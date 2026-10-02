function pickEnv(e) {
  return e || process.env;
}

function resolveTestCoordinates(e) {
  const env = pickEnv(e);
  return {
    host: env.TEST_DATABASE_HOST || "127.0.0.1",
    port: String(env.TEST_DATABASE_PORT || "3306"),
    user: env.TEST_DATABASE_USER || "edu_app",
    name: env.TEST_DATABASE_NAME || "education_system_test",
  };
}

function resolveRuntimeCoordinates(e) {
  const env = pickEnv(e);
  return {
    host: env.DATABASE_HOST || "127.0.0.1",
    port: String(env.DATABASE_PORT || "3306"),
    user: env.DATABASE_USER || "edu_app",
    name: env.DATABASE_NAME || "education_system",
  };
}

function sameCoordinates(a, b) {
  return a.host === b.host && a.port === b.port && a.user === b.user && a.name === b.name;
}

function assertSafeTestDatabase(e) {
  const env = pickEnv(e);
  if (String(env.NODE_ENV) !== "test") {
    throw new Error("Refusing to recreate database: NODE_ENV is not \"test\"");
  }
  const testCoords = resolveTestCoordinates(env);
  const runtimeCoords = resolveRuntimeCoordinates(env);
  if (sameCoordinates(testCoords, runtimeCoords)) {
    throw new Error(
      "Refusing to recreate database: test coordinates equal runtime coordinates"
    );
  }
  return { testCoords, runtimeCoords };
}

module.exports = {
  resolveTestCoordinates,
  resolveRuntimeCoordinates,
  sameCoordinates,
  assertSafeTestDatabase,
};
