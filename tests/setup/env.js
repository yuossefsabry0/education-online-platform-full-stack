// Jest setupFiles hook: runs in the worker BEFORE any test module is loaded,
// guaranteeing that every subsequent require sees the test environment and the
// separate test database even if .env declares something different.
process.env.NODE_ENV = "test";
process.env.RATE_LIMIT_ENABLED = "false";
process.env.FILE_URL_ALLOWED_HOSTS = "media.example.com";

require("dotenv").config();