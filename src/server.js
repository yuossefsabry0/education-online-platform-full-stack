require("dotenv").config();

const app = require("./app");
const config = require("./config");
const prisma = require("./db/prisma");
const { startExpirationJob } = require("./jobs/expireSubscriptions");
const { startTokenCleanupJob } = require("./jobs/cleanupTokens");
const { startFileCleanupJob } = require("./jobs/cleanupFiles");

async function main() {
  await prisma.$connect();
  console.log("Database connected");

  startExpirationJob();
  startTokenCleanupJob();
  startFileCleanupJob();

  app.listen(config.port, () => {
    console.log(`Server running on http://localhost:${config.port}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});