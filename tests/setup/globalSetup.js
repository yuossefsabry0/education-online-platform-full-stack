// Jest globalSetup hook: runs once in the parent process before any test.
// Recreates the SEPARATE test database from scratch and applies the Prisma
// migrations to it, so the seeded development data never interferes with
// test assertions. The real development/production database is untouched.
const path = require("path");
const { spawnSync } = require("child_process");
const mariadb = require("mariadb");

require("dotenv").config(); // globalSetup runs before setupFiles, so load .env here
const { assertSafeTestDatabase } = require("./dbSafety");

const projectRoot = path.join(__dirname, "..", "..");
const testDbName =
  process.env.TEST_DATABASE_NAME || "education_system_test";

async function recreateTestDatabase() {
  const conn = await mariadb.createConnection({
    host: process.env.TEST_DATABASE_HOST || "127.0.0.1",
    port: parseInt(process.env.TEST_DATABASE_PORT, 10) || 3306,
    user: process.env.TEST_DATABASE_USER || "edu_app",
    password: process.env.TEST_DATABASE_PASSWORD || "",
    // Deliberately no `database`: we may need to (re)create it.
  });

  // Drop any leftovers from a previous test run, then recreate fresh.
  await conn.query(`DROP DATABASE IF EXISTS \`${testDbName}\``);
  await conn.query(
    `CREATE DATABASE \`${testDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await conn.end();
}

module.exports = async () => {
  process.env.NODE_ENV = "test";
  process.env.RATE_LIMIT_ENABLED = "false";

  assertSafeTestDatabase(process.env);
  await recreateTestDatabase();
  console.log(`[test] Recreated test database: ${testDbName}`);

  // Point the Prisma CLI migrate command at the test database.
  process.env.DATABASE_URL =
    process.env.TEST_DATABASE_URL ||
    `mysql://${process.env.TEST_DATABASE_USER || "edu_app"}:${
      process.env.TEST_DATABASE_PASSWORD || ""
    }@${process.env.TEST_DATABASE_HOST || "127.0.0.1"}:${
      process.env.TEST_DATABASE_PORT || "3306"
    }/${testDbName}`;
  process.env.DATABASE_HOST = process.env.TEST_DATABASE_HOST || "127.0.0.1";
  process.env.DATABASE_PORT = process.env.TEST_DATABASE_PORT || "3306";
  process.env.DATABASE_USER = process.env.TEST_DATABASE_USER || "edu_app";
  process.env.DATABASE_PASSWORD = process.env.TEST_DATABASE_PASSWORD || "";
  process.env.DATABASE_NAME = testDbName;

  const prismaCli = path.join(
    projectRoot,
    "node_modules",
    "prisma",
    "build",
    "index.js"
  );

  // Invoke the Prisma CLI directly through node (avoids `npx` path/ENOENT
  // issues on Windows when spawning from a non-shell context).
  const result = spawnSync(
    process.execPath,
    [prismaCli, "migrate", "deploy"],
    {
      cwd: projectRoot,
      env: process.env,
      encoding: "utf8",
    }
  );

  if (result.error) {
    throw new Error(`[test] Failed to spawn prisma: ${result.error.message}`);
  }

  if (result.status !== 0) {
    const tail =
      `${result.stdout || ""}\n${result.stderr || ""}`.trim().slice(-2000);
    throw new Error(`[test] prisma migrate deploy failed for the test database\n${tail}`);
  }

  console.log("[test] Test database schema ready");
};