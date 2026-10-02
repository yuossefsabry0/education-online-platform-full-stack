const config = require("../config");
const { logger } = require("./logger");

const outbox = [];
const OUTBOX_LIMIT = 200;

let smtpTransporter = null;

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  if (config.mail.provider !== "smtp") return null;
  if (!config.mail.smtpHost) return null;
  const nodemailer = require("nodemailer");
  smtpTransporter = nodemailer.createTransport({
    host: config.mail.smtpHost,
    port: config.mail.smtpPort,
    secure: config.mail.smtpPort === 465,
    auth: config.mail.smtpUser
      ? { user: config.mail.smtpUser, pass: config.mail.smtpPassword }
      : undefined,
  });
  return smtpTransporter;
}

function resetMailerForTests() {
  outbox.length = 0;
  smtpTransporter = null;
}

function getOutbox() {
  return outbox.slice();
}

async function sendMail({ to, subject, text }) {
  const entry = {
    to,
    subject,
    text,
    from: config.mail.from,
    provider: config.mail.provider,
    at: new Date().toISOString(),
  };
  outbox.push(entry);
  if (outbox.length > OUTBOX_LIMIT) outbox.splice(0, outbox.length - OUTBOX_LIMIT);
  const transporter = getSmtpTransporter();
  if (transporter) {
    await transporter.sendMail({ from: config.mail.from, to, subject, text });
    return entry;
  }
  logger.info(`[mail:${config.mail.provider}] to=${to} subject=${subject}`);
  return entry;
}

module.exports = { sendMail, getOutbox, resetMailerForTests };
