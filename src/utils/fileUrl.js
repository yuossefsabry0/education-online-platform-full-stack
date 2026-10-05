const STORED_FILE_URL_PATTERN = /^\/api\/files\/[a-f0-9]{32}\.[a-z0-9]+$/;

function allowedExternalHosts() {
  return String(process.env.FILE_URL_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isAcceptedFileUrl(value) {
  if (typeof value !== "string") return false;
  if (/^\s*(javascript|vbscript)\s*:/i.test(value)) return false;
  const trimmed = value.trim();
  if (/^https:\/\//i.test(trimmed) || /^http:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "http:" && u.protocol !== "https:") return false;
      return allowedExternalHosts().includes(u.hostname.toLowerCase());
    } catch {
      return false;
    }
  }
  if (STORED_FILE_URL_PATTERN.test(trimmed)) return true;
  return false;
}

module.exports = { isAcceptedFileUrl, STORED_FILE_URL_PATTERN, allowedExternalHosts };
