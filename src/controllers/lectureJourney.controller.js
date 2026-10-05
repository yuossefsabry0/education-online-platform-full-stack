// Sequential tiered Lecture Journey (additive — does not modify existing flows).
// Tier order per lecture: Lecture entry (title+details) -> Exam (>=50% to pass)
//   -> Lecture files (LESSON_CONTENT companion layer, own path) -> Lecture video
//   (LECTURE fileUrl layer, own path, watch tracked).
// Lectures themselves are sequential: lecture N unlocks only after lecture N-1
// exam is passed. Uses existing tables only (TeacherContent LECTURE +
// optional LESSON_CONTENT files companion marked "[lecture:<id>]" in its body,
// Exam with lessonContentId = lecture id, ExamAttempt, LogHistory). No schema change.
const prisma = require("../db/prisma");
const { success, error } = require("../utils/apiResponse");
const { httpError } = require("../utils/httpError");
const { teacherIdParam } = require("../validations/subscription.schema");
const { findActiveTeacher } = require("../services/teacherContent");

const PASS_PERCENT = 50;

function parseTeacherId(raw) {
  const result = teacherIdParam.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "teacherId",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

function parseLectureId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id < 1) {
    throw httpError(400, "VALIDATION_ERROR", "Invalid lecture ID");
  }
  return id;
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

// Companion marker linking a LESSON_CONTENT files layer to its LECTURE.
// Stored at the start of the companion body: "[lecture:<lectureId>] ".
// Existing rows without a marker are ignored (backward compatible).
function filesMarker(lectureId) {
  return `[lecture:${lectureId}]`;
}

function stripFilesMarker(body, lectureId) {
  if (typeof body !== "string") return body;
  const marker = filesMarker(lectureId);
  if (body.startsWith(marker)) return body.slice(marker.length).trimStart();
  return body;
}

function isVideoUrl(url) {
  if (typeof url !== "string") return false;
  return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url);
}

// Files layer companion (distinct from the video layer stored on the LECTURE).
async function findFilesCompanion(teacherId, lectureId) {
  const companions = await prisma.teacherContent.findMany({
    where: { teacherId, type: "LESSON_CONTENT", isPublished: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, body: true, fileUrl: true, createdAt: true },
  });
  const marker = filesMarker(lectureId);
  return companions.find((c) => typeof c.body === "string" && c.body.includes(marker)) || null;
}

// Full ordered lecture list for sequential gating (published LECTUREs, oldest first).
async function orderedLectures(teacherId) {
  return prisma.teacherContent.findMany({
    where: { teacherId, type: "LECTURE", isPublished: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, body: true, fileUrl: true, createdAt: true },
  });
}

async function passedExamIds(studentId, examIds) {
  if (!examIds.length) return new Set();
  const attempts = await prisma.examAttempt.findMany({
    where: { studentId, examId: { in: examIds } },
    select: { examId: true, percent: true },
  });
  const passed = new Set();
  for (const a of attempts) {
    const p = toNumber(a.percent);
    if (p !== null && p >= PASS_PERCENT) passed.add(a.examId);
  }
  return passed;
}

// GET /api/content/teacher/:teacherId/lectures/:lectureId/journey
async function getLectureJourney(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const lectureId = parseLectureId(req.params.lectureId);
    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }

    const lectures = await orderedLectures(teacherId);
    const lecture = lectures.find((l) => l.id === lectureId);
    if (!lecture) {
      return error(res, "Lecture not found", 404, "NOT_FOUND");
    }
    const position = lectures.findIndex((l) => l.id === lectureId);
    const totalLectures = lectures.length;

    // Exams gated to this lecture (Exam.lessonContentId = lecture id).
    const exams = await prisma.exam.findMany({
      where: { teacherId, isPublished: true, lessonContentId: lectureId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        title: true,
        timeLimitSeconds: true,
        createdAt: true,
        _count: { select: { questions: true } },
      },
    });

    const examIds = exams.map((e) => e.id);
    // All exam ids of previous lectures (for sequential lock).
    const prevLectureIds = lectures.slice(0, position).map((l) => l.id);
    let prevExamIds = [];
    if (prevLectureIds.length) {
      const prevExams = await prisma.exam.findMany({
        where: { teacherId, isPublished: true, lessonContentId: { in: prevLectureIds } },
        select: { id: true, lessonContentId: true },
      });
      prevExamIds = prevExams.map((e) => e.id);
      // Lectures without any exam do not block the sequence.
      const prevLecturesWithExams = new Set(prevExams.map((e) => e.lessonContentId));
      const blockingPrev = lectures
        .slice(0, position)
        .filter((l) => prevLecturesWithExams.has(l.id));
      if (blockingPrev.length) {
        const passedPrev = await passedExamIds(req.user.id, prevExamIds);
        const passedByLecture = new Map();
        for (const e of prevExams) {
          if (passedPrev.has(e.id)) passedByLecture.set(e.lessonContentId, true);
        }
        const firstBlocked = blockingPrev.find((l) => !passedByLecture.get(l.id));
        if (firstBlocked) {
          return success(res, {
            lecture: { id: lecture.id, title: lecture.title, body: lecture.body },
            files: null,
            position: position + 1,
            totalLectures,
            locked: true,
            lockedReason: `Complete Lecture ${lectures.findIndex((l) => l.id === firstBlocked.id) + 1} first — pass its exam with at least ${PASS_PERCENT}%.`,
            lockedByLecture: { id: firstBlocked.id, title: firstBlocked.title },
            passed: false,
            bestPercent: null,
            exams: [],
            materialUnlocked: false,
            videoUnlocked: false,
          });
        }
      }
    }

    // Current lecture pass state.
    let bestPercent = null;
    let passed = false;
    let lastSubmittedAt = null;
    if (examIds.length) {
      const attempts = await prisma.examAttempt.findMany({
        where: { studentId: req.user.id, examId: { in: examIds } },
        orderBy: { submittedAt: "desc" },
        select: { examId: true, percent: true, submittedAt: true },
      });
      for (const a of attempts) {
        const p = toNumber(a.percent);
        if (p === null) continue;
        if (bestPercent === null || p > bestPercent) bestPercent = p;
        if (p >= PASS_PERCENT) passed = true;
        if (!lastSubmittedAt) lastSubmittedAt = a.submittedAt;
      }
    } else {
      // No exam attached yet: do not block material (teacher has not published one).
      passed = true;
    }

    const materialUnlocked = passed;
    const videoUnlocked = passed;

    // Distinct layers: video lives on the LECTURE fileUrl; files live on an
    // optional LESSON_CONTENT companion. URLs stay hidden until pass.
    // Fallback: lectures created before the split store their document on the
    // LECTURE fileUrl — when it is not a video, expose it on the files layer
    // too so previously uploaded files keep appearing to students.
    const companion = await findFilesCompanion(teacherId, lectureId);
    const fallbackFiles =
      !companion && lecture.fileUrl && !isVideoUrl(lecture.fileUrl)
        ? {
            id: lecture.id,
            title: lecture.title,
            body: null,
            fileUrl: passed ? lecture.fileUrl : null,
            hasFile: true,
            createdAt: lecture.createdAt,
          }
        : null;

    return success(res, {
      lecture: {
        id: lecture.id,
        title: lecture.title,
        body: lecture.body,
        // File/video URLs stay hidden until the exam is passed (tier gating is
        // enforced in the UI; subscription gating still enforced on download).
        // videoUrl is the distinct video layer; fileUrl kept as legacy alias.
        videoUrl: passed ? lecture.fileUrl : null,
        fileUrl: passed ? lecture.fileUrl : null,
        createdAt: lecture.createdAt,
      },
      // Distinct files layer (own path on the student side).
      files: companion
        ? {
            id: companion.id,
            title: companion.title,
            body: stripFilesMarker(companion.body, lectureId) || null,
            fileUrl: passed ? companion.fileUrl : null,
            hasFile: Boolean(companion.fileUrl),
            createdAt: companion.createdAt,
          }
        : fallbackFiles,
      position: position + 1,
      totalLectures,
      locked: false,
      lockedReason: null,
      lockedByLecture: null,
      passThreshold: PASS_PERCENT,
      passed,
      bestPercent,
      lastSubmittedAt,
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        timeLimitSeconds: e.timeLimitSeconds,
        createdAt: e.createdAt,
        questionCount: e._count.questions,
      })),
      materialUnlocked,
      videoUnlocked,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/content/teacher/:teacherId/lectures/:lectureId/watch
// Tracks that the student watched the lecture video. Requires the exam to be
// passed first (same tier rule). Logged to LogHistory so it appears in
// My History, and the frontend mirrors it into profile learning statistics.
async function recordLectureWatch(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const lectureId = parseLectureId(req.params.lectureId);
    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const lecture = await prisma.teacherContent.findFirst({
      where: { id: lectureId, teacherId, type: "LECTURE", isPublished: true },
      select: { id: true, title: true },
    });
    if (!lecture) {
      return error(res, "Lecture not found", 404, "NOT_FOUND");
    }
    const exams = await prisma.exam.findMany({
      where: { teacherId, isPublished: true, lessonContentId: lectureId },
      select: { id: true },
    });
    if (exams.length) {
      const passed = await passedExamIds(
        req.user.id,
        exams.map((e) => e.id)
      );
      if (passed.size === 0) {
        return error(
          res,
          `Pass the lecture exam with at least ${PASS_PERCENT}% before watching the lecture.`,
          403,
          "LECTURE_LOCKED"
        );
      }
    }
    const seconds =
      req.body && Number.isFinite(Number(req.body.secondsWatched))
        ? Math.max(0, Math.min(Number(req.body.secondsWatched), 86400))
        : null;
    await prisma.logHistory.create({
      data: {
        actionType: "LECTURE_WATCHED",
        actorId: String(req.user.id),
        actorType: "STUDENT",
        targetId: String(lectureId),
        details: {
          teacherId,
          lectureId,
          lectureTitle: lecture.title,
          ...(seconds !== null ? { secondsWatched: seconds } : {}),
        },
      },
    });
    return success(res, { lectureId, watched: true }, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { getLectureJourney, recordLectureWatch, PASS_PERCENT };
