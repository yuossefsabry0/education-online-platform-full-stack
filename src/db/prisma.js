require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const config = require("../config");

const adapter = new PrismaMariaDb({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.name,
  connectionLimit: 5,
  // Wait longer than the driver's 10s default when acquiring a pooled
  // connection, so a slow-but-reachable database does not trip the pool
  // timeout (P2039) on the first query of a pass.
  acquireTimeout: 30000,
});

const prisma = new PrismaClient({
  adapter,
  log: config.env === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;