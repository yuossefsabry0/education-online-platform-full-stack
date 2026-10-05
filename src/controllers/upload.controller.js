const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const { loadActiveRoles } = require("../middlewares/auth");
const { isAcceptedFileUrl } = require("../utils/fileUrl");
const { saveUpload, storedNameForUrl, resolveStoredPath, extensionOf, ALLOWED_UPLOADS } = require("../utils/storage");
const { deriveTeacherRole } = require("../utils/teacherRole");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.storage.maxBytes, files: 1 },
});

const uploadSingle = upload.single("file");

async function storeTeacherFile({ teacherId, actorId, actorType, file }) {
  if (!file || !file.buffer) {
    const err = new Error("A file upload named 'file' is required");
    err.status = 400;
    err.code = "FILE_REQUIRED";
    throw err;
  }
  const saved = await saveUpload(file.buffer, file.originalname, file.mimetype);
  if (!isAcceptedFileUrl(saved.fileUrl)) {
    const err = new Error("Stored file URL failed validation");
    err.status = 500;
    err.code = "INTERNAL_ERROR";
    throw err;
  }
  await prisma.logHistory.create({
    data: {
      actionType: "FILE_UPLOADED",
      actorId: String(actorId),
      actorType,
      targetId: String(teacherId),
      details: {
        teacherId,
        fileName: saved.name,
        mimeType: saved.mimeType,
        size: saved.size,
      },
    },
  });
  return saved;
}

async function uploadTeacherFile(req, res, next) {
  try {
    const teacherId = req.user.id;
    const teacher = await prisma.teacher.findFirst({
      where: { id: teacherId, isActive: true },
      select: { id: true },
    });
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const saved = await storeTeacherFile({
      teacherId,
      actorId: teacherId,
      actorType: "TEACHER",
      file: req.file,
    });
    return success(res, saved, 201);
  } catch (err) {
    next(err);
  }
}

async function uploadTeacherFileAsAdmin(req, res, next) {
  try {
    const teacherId = Number(req.params.teacherId);
    const teacher = await prisma.teacher.findUnique({
      where: { id: teacherId },
      select: { id: true },
    });
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const saved = await storeTeacherFile({
      teacherId,
      actorId: req.user.id,
      actorType: "ADMIN",
      file: req.file,
    });
    return success(res, saved, 201);
  } catch (err) {
    next(err);
  }
}

async function downloadFile(req, res, next) {
  try {
    const name = storedNameForUrl(`/api/files/${req.params.name}`);
    if (!name) {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    const rows = await prisma.teacherContent.findMany({
      where: { fileUrl: `/api/files/${name}` },
      select: { id: true, teacherId: true, isPublished: true },
    });
    if (!rows.length) {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    const { userType, id } = req.user;
    const contentIdRaw = req.query.contentId;
    if (contentIdRaw !== undefined && contentIdRaw !== "") {
      const contentId = Number(contentIdRaw);
      if (!Number.isInteger(contentId)) {
        return error(res, "Invalid content ID", 400, "VALIDATION_ERROR");
      }
      const row = rows.find((r) => r.id === contentId);
      if (!row) {
        return error(res, "Access denied", 403, "FORBIDDEN");
      }
      if (userType === "teacher") {
        if (row.teacherId !== id) {
          return error(res, "Access denied", 403, "FORBIDDEN");
        }
      } else if (userType === "student") {
        const roles = await loadActiveRoles(req.user);
        if (!row.isPublished || !roles.includes(deriveTeacherRole(row.teacherId)) || !rows.every((r) => roles.includes(deriveTeacherRole(r.teacherId)))) {
          return error(res, "Access denied: active subscription required for this content", 403, "SUBSCRIPTION_REQUIRED");
        }
      } else if (userType !== "admin") {
        return error(res, "Access denied", 403, "FORBIDDEN");
      }
    } else if (userType === "teacher") {
      if (!rows.some((r) => r.teacherId === id)) {
        return error(res, "Access denied", 403, "FORBIDDEN");
      }
    } else if (userType === "student") {
      const roles = await loadActiveRoles(req.user);
      const publishedCovered = rows.filter((r) => r.isPublished && roles.includes(deriveTeacherRole(r.teacherId)));
      if (publishedCovered.length === 0 || !rows.every((r) => roles.includes(deriveTeacherRole(r.teacherId)))) {
        return error(res, "Access denied: active subscription required for this content", 403, "SUBSCRIPTION_REQUIRED");
      }
    } else if (userType !== "admin") {
      return error(res, "Access denied", 403, "FORBIDDEN");
    }
    const target = resolveStoredPath(name);
    if (!target) {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    let stat = null;
    try {
      stat = await fs.promises.stat(target);
    } catch {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    if (!stat.isFile()) {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    const mimeType = ALLOWED_UPLOADS[extensionOf(name)] || "application/octet-stream";
    const etag = crypto.createHash("sha1").update(`${name}-${stat.size}-${stat.mtimeMs}`).digest("hex");
    const lastModified = new Date(stat.mtimeMs).toUTCString();
    if (req.headers["if-none-match"] === etag) {
      res.setHeader("ETag", etag);
      return res.status(304).end();
    }
    res.setHeader("Content-Type", mimeType);
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("Accept-Ranges", "bytes");
    if (req.query && req.query.download === "1") {
      res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    } else {
      res.setHeader("Content-Disposition", `inline; filename="${name}"`);
    }
    const range = req.headers.range;
    if (range) {
      const m = String(range).match(/^bytes=(\d*)-(\d*)$/);
      if (m) {
        let start = m[1] === "" ? null : parseInt(m[1], 10);
        let end = m[2] === "" ? null : parseInt(m[2], 10);
        if (start === null && end !== null) {
          start = Math.max(stat.size - end, 0);
          end = stat.size - 1;
        } else if (start !== null && end === null) {
          end = stat.size - 1;
        }
        if (start !== null && end !== null && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && start < stat.size) {
          const clampedEnd = Math.min(end, stat.size - 1);
          res.setHeader("Content-Range", `bytes ${start}-${clampedEnd}-${stat.size}`);
          res.setHeader("Content-Length", clampedEnd - start + 1);
          res.status(206);
          const stream = fs.createReadStream(target, { start, end: clampedEnd });
          stream.on("error", (streamErr) => next(streamErr));
          return stream.pipe(res);
        }
      }
    }
    res.setHeader("Content-Length", stat.size);
    res.status(200);
    const stream = fs.createReadStream(target);
    stream.on("error", (streamErr) => next(streamErr));
    return stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadSingle, uploadTeacherFile, uploadTeacherFileAsAdmin, downloadFile };
