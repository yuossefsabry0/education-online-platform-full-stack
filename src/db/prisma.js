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
  connectionLimit: config.database.pool.connectionLimit,
  acquireTimeout: config.database.pool.acquireTimeout,
});

const prisma = new PrismaClient({
  adapter,
  log: config.env === "development" ? ["warn", "error"] : ["error"],
});

module.exports = prisma;