const multer = require("multer");
const prisma = require("../db/prisma");
const config = require("../config");
const { success, error } = require("../utils/apiResponse");
const { loadActiveRoles } = require("../middlewares/auth");
const { isAcceptedFileUrl } = require("../utils/fileUrl");
const { saveUpload, readStored, storedNameForUrl } = require("../utils/storage");

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
    if (userType === "teacher") {
      if (!rows.some((r) => r.teacherId === id)) {
        return error(res, "Access denied", 403, "FORBIDDEN");
      }
    } else if (userType === "student") {
      const roles = await loadActiveRoles(req.user);
      const covered = rows.some((r) => r.isPublished && roles.includes(`SUB${r.teacherId}`));
      if (!covered) {
        return error(res, "Access denied: active subscription required for this content", 403, "SUBSCRIPTION_REQUIRED");
      }
    } else if (userType !== "admin") {
      return error(res, "Access denied", 403, "FORBIDDEN");
    }
    const stored = await readStored(name);
    if (!stored) {
      return error(res, "File not found", 404, "NOT_FOUND");
    }
    res.setHeader("Content-Type", stored.mimeType);
    res.setHeader("Content-Length", stored.data.length);
    return res.status(200).send(stored.data);
  } catch (err) {
    next(err);
  }
}

module.exports = { uploadSingle, uploadTeacherFile, uploadTeacherFileAsAdmin, downloadFile };
