const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config");

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
