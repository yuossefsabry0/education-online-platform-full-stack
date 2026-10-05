const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { logger } = require("./logger");

const ALLOWED_UPLOADS = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
};

const STORED_NAME_PATTERN = /^[a-f0-9]{32}\.[a-z0-9]+$/;

function storageRoot() {
  const root = config.storage.root;
  return path.isAbsolute(root) ? root : path.join(process.cwd(), root);
}

function ensureRoot() {
  fs.mkdirSync(storageRoot(), { recursive: true });
}

function extensionOf(filename) {
  return path.extname(String(filename || "").toLowerCase());
}

function resolveStoredPath(name) {
  if (!STORED_NAME_PATTERN.test(String(name))) return null;
  const root = storageRoot();
  const resolved = path.resolve(root, String(name));
  if (resolved !== path.join(root, String(name))) return null;
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function fileUrlFor(name) {
  return `/api/files/${name}`;
}

function storedNameForUrl(fileUrl) {
  const prefix = "/api/files/";
  if (typeof fileUrl !== "string" || !fileUrl.startsWith(prefix)) return null;
  const name = fileUrl.slice(prefix.length).split(/[?#]/)[0];
  return STORED_NAME_PATTERN.test(name) ? name : null;
}

function sniffKind(buffer) {
  try {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return "unknown";
    if (buffer.length >= 8 && buffer[0] === 137 && buffer[1] === 80 && buffer[2] === 78 && buffer[3] === 71 && buffer[4] === 13 && buffer[5] === 10 && buffer[6] === 26 && buffer[7] === 10) return "png";
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "jpg";
    if (buffer[0] === 71 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 56) return "gif";
    if (buffer.length >= 12 && buffer[0] === 82 && buffer[1] === 73 && buffer[2] === 70 && buffer[3] === 70 && buffer[8] === 87 && buffer[9] === 69 && buffer[10] === 66 && buffer[11] === 80) return "webp";
    if (buffer[0] === 37 && buffer[1] === 80 && buffer[2] === 68 && buffer[3] === 70) return "pdf";
    if (buffer.length >= 8 && buffer[4] === 102 && buffer[5] === 116 && buffer[6] === 121 && buffer[7] === 112) return "mp4";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function expectedKindForExt(ext) {
  if (ext === ".png") return "png";
  if (ext === ".jpg" || ext === ".jpeg") return "jpg";
  if (ext === ".gif") return "gif";
  if (ext === ".webp") return "webp";
  if (ext === ".pdf") return "pdf";
  if (ext === ".mp4") return "mp4";
  return "unknown";
}

async function saveUpload(buffer, originalName, mimeType) {
  const ext = extensionOf(originalName);
  if (!ALLOWED_UPLOADS[ext] || ALLOWED_UPLOADS[ext] !== mimeType) {
    const err = new Error("Unsupported file type");
    err.status = 400;
    err.code = "UNSUPPORTED_FILE_TYPE";
    throw err;
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    const err = new Error("Empty file");
    err.status = 400;
    err.code = "EMPTY_FILE";
    throw err;
  }
  if (buffer.length > config.storage.maxBytes) {
    const err = new Error("File too large");
    err.status = 413;
    err.code = "FILE_TOO_LARGE";
    throw err;
  }
  try {
    const detected = sniffKind(buffer);
    const expected = expectedKindForExt(ext);
    if (detected !== expected) {
      logger.warn("[upload] Magic-byte mismatch (rejected)", { ext, expected, detected, size: buffer.length });
      const err = new Error("Unsupported file type");
      err.status = 400;
      err.code = "UNSUPPORTED_FILE_TYPE";
      throw err;
    }
  } catch (sniffErr) {
    if (sniffErr && sniffErr.code === "UNSUPPORTED_FILE_TYPE") throw sniffErr;
  }
  ensureRoot();
  const name = `${crypto.randomBytes(16).toString("hex")}${ext}`;
  const target = resolveStoredPath(name);
  await fs.promises.writeFile(target, buffer);
  return { name, fileUrl: fileUrlFor(name), mimeType: ALLOWED_UPLOADS[ext], size: buffer.length };
}

async function readStored(name) {
  const target = resolveStoredPath(name);
  if (!target) return null;
  try {
    const data = await fs.promises.readFile(target);
    return { data, mimeType: ALLOWED_UPLOADS[extensionOf(name)] };
  } catch {
    return null;
  }
}

async function deleteStored(name) {
  const target = resolveStoredPath(name);
  if (!target) return;
  try {
    await fs.promises.unlink(target);
  } catch {}
}

module.exports = {
  ALLOWED_UPLOADS,
  STORED_NAME_PATTERN,
  storageRoot,
  extensionOf,
  resolveStoredPath,
  fileUrlFor,
  storedNameForUrl,
  saveUpload,
  readStored,
  deleteStored,
};
