const dotenv = require("dotenv");

dotenv.config();

const isTest = process.env.NODE_ENV === "test";

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,
  database: {
    // When running tests, transparently point at the SEPARATE test database so
    // test data never touches the seeded development/production database.
    host: isTest
      ? process.env.TEST_DATABASE_HOST || "127.0.0.1"
      : process.env.DATABASE_HOST || "127.0.0.1",
    port: isTest
      ? parseInt(process.env.TEST_DATABASE_PORT, 10) || 3306
      : parseInt(process.env.DATABASE_PORT, 10) || 3306,
    user: isTest
      ? process.env.TEST_DATABASE_USER || "edu_app"
      : process.env.DATABASE_USER || "edu_app",
    password: isTest
      ? process.env.TEST_DATABASE_PASSWORD || ""
      : process.env.DATABASE_PASSWORD || "",
    name: isTest
      ? process.env.TEST_DATABASE_NAME || "education_system_test"
      : process.env.DATABASE_NAME || "education_system",
    pool: {
      connectionLimit: 5,
      acquireTimeout: 30000,
    },
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me",
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
    loginTokenExpiresIn: process.env.LOGIN_TOKEN_EXPIRES_IN || "24h",
  },
  security: {
    bcryptRounds: 10,
  },
  jobs: {
    expiryIntervalMs: 60 * 1000,
  },
  contact: {
    email: process.env.CONTACT_EMAIL || "test@gmail.com",
  },
  mail: {
    provider: process.env.MAIL_PROVIDER || "log",
    from: process.env.MAIL_FROM || process.env.CONTACT_EMAIL || "test@gmail.com",
    smtpHost: process.env.MAIL_SMTP_HOST || "",
    smtpPort: parseInt(process.env.MAIL_SMTP_PORT, 10) || 587,
    smtpUser: process.env.MAIL_SMTP_USER || "",
    smtpPassword: process.env.MAIL_SMTP_PASSWORD || "",
  },
  storage: {
    root: process.env.UPLOAD_DIR || "uploads",
    maxBytes: parseInt(process.env.UPLOAD_MAX_BYTES, 10) || 10 * 1024 * 1024,
  },
  // Rate limiting can be disabled per environment (RATE_LIMIT_ENABLED=false);
  // integration tests rely on this so they never trip the auth limits.
  rateLimit: {
    enabled:
      process.env.RATE_LIMIT_ENABLED !== "false" &&
      process.env.RATE_LIMIT_ENABLED !== "0",
  },
};

if (config.env === "production") {
  if (config.jwt.accessSecret === "dev_access_secret_change_me") {
    throw new Error("JWT_ACCESS_SECRET must be set in production");
  }
  if (config.jwt.refreshSecret === "dev_refresh_secret_change_me") {
    throw new Error("JWT_REFRESH_SECRET must be set in production");
  }
  if (!config.database.password) {
    throw new Error("DATABASE_PASSWORD must be set in production");
  }
  if (config.mail.provider === "log") {
    throw new Error("MAIL_PROVIDER must be set to smtp in production");
  }
}

module.exports = config;