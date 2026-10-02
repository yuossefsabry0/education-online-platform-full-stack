const {
  assertSafeTestDatabase,
  resolveTestCoordinates,
  resolveRuntimeCoordinates,
} = require("../setup/dbSafety");

describe("test database safety guard", () => {
  it("aborts when test coordinates equal runtime coordinates", () => {
    const env = {
      NODE_ENV: "test",
      TEST_DATABASE_HOST: "127.0.0.1",
      TEST_DATABASE_PORT: "3306",
      TEST_DATABASE_USER: "edu_app",
      TEST_DATABASE_NAME: "education_system",
      DATABASE_HOST: "127.0.0.1",
      DATABASE_PORT: "3306",
      DATABASE_USER: "edu_app",
      DATABASE_NAME: "education_system",
    };
    expect(() => assertSafeTestDatabase(env)).toThrow(/Refusing/);
  });

  it("aborts when NODE_ENV is ambiguous", () => {
    const env = {
      NODE_ENV: "development",
      TEST_DATABASE_NAME: "education_system_test",
      DATABASE_NAME: "education_system",
    };
    expect(() => assertSafeTestDatabase(env)).toThrow(/NODE_ENV/);
  });

  it("passes silently for the normal isolated configuration", () => {
    const env = {
      NODE_ENV: "test",
      TEST_DATABASE_HOST: "127.0.0.1",
      TEST_DATABASE_PORT: "3306",
      TEST_DATABASE_USER: "edu_app",
      TEST_DATABASE_NAME: "education_system_test",
      DATABASE_HOST: "127.0.0.1",
      DATABASE_PORT: "3306",
      DATABASE_USER: "edu_app",
      DATABASE_NAME: "education_system",
    };
    const result = assertSafeTestDatabase(env);
    expect(resolveTestCoordinates(env).name).toBe("education_system_test");
    expect(resolveRuntimeCoordinates(env).name).toBe("education_system");
    expect(result.testCoords.name).not.toBe(result.runtimeCoords.name);
  });
});
