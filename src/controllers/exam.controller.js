const prisma = require("../db/prisma");
const { success, error } = require("../utils/apiResponse");
const { httpError } = require("../utils/httpError");
const { gradeExam } = require("../utils/examGrading");
const { teacherIdParam } = require("../validations/subscription.schema");
const { findActiveTeacher } = require("../services/teacherContent");

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

function parseExamId(raw) {
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    throw httpError(400, "VALIDATION_ERROR", "Invalid exam ID");
  }
  return id;
}

async function assertOwnExam(teacherId, examId) {
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) {
    throw httpError(404, "NOT_FOUND", "Exam not found");
  }
  if (exam.teacherId !== teacherId) {
    throw httpError(403, "FORBIDDEN", "Access denied: you can only modify your own exams");
  }
  return exam;
}

async function assertOwnLesson(teacherId, lessonContentId) {
  if (lessonContentId === undefined || lessonContentId === null) return null;
  const lesson = await prisma.teacherContent.findUnique({
    where: { id: lessonContentId },
    select: { id: true, teacherId: true, type: true, title: true },
  });
  if (!lesson || lesson.teacherId !== teacherId) {
    throw httpError(400, "VALIDATION_ERROR", "Lesson must be one of your own content items");
  }
  return lesson;
}

// ---- Teacher role ----

async function listExams(req, res, next) {
  try {
    const exams = await prisma.exam.findMany({
      where: { teacherId: req.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        lessonContentId: true,
        timeLimitSeconds: true,
        isPublished: true,
        createdAt: true,
        lesson: { select: { id: true, title: true, type: true } },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    return success(res, {
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        lessonContentId: e.lessonContentId,
        lesson: e.lesson,
        timeLimitSeconds: e.timeLimitSeconds,
        isPublished: e.isPublished,
        createdAt: e.createdAt,
        questionCount: e._count.questions,
        attemptCount: e._count.attempts,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function getTeacherExam(req, res, next) {
  try {
    const examId = parseExamId(req.params.examId);
    const exam = await assertOwnExam(req.user.id, examId);
    const questions = await prisma.examQuestion.findMany({
      where: { examId },
      orderBy: { position: "asc" },
    });
    return success(res, { exam: { ...exam, questions } });
  } catch (err) {
    next(err);
  }
}

async function createExam(req, res, next) {
  try {
    const teacherId = req.user.id;
    const { title, lessonContentId, timeLimitSeconds, isPublished, questions } = req.body;
    const lesson = await assertOwnLesson(teacherId, lessonContentId);
    if (!lesson) {
      throw httpError(400, "VALIDATION_ERROR", "Lesson is required — select the lesson this exam belongs to");
    }

    const exam = await prisma.exam.create({
      data: {
        teacherId,
        title,
        lessonContentId,
        timeLimitSeconds: timeLimitSeconds ?? 600,
        isPublished: isPublished !== undefined ? isPublished : true,
        questions: {
          create: questions.map((q, i) => ({
            text: q.text,
            options: q.options,
            correctIndex: q.correctIndex,
            position: i,
          })),
        },
      },
      select: { id: true, title: true },
    });

    await prisma.logHistory.create({
      data: {
        actionType: "EXAM_CREATED",
        actorId: String(teacherId),
        actorType: "TEACHER",
        targetId: String(exam.id),
        details: { title, teacherId, questionCount: questions.length },
      },
    });

    const created = await prisma.exam.findUnique({
      where: { id: exam.id },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    return success(res, { exam: created }, 201);
  } catch (err) {
    next(err);
  }
}

async function updateExam(req, res, next) {
  try {
    const teacherId = req.user.id;
    const examId = parseExamId(req.params.examId);
    await assertOwnExam(teacherId, examId);
    const { title, lessonContentId, timeLimitSeconds, isPublished } = req.body;
    if (lessonContentId !== undefined) {
      await assertOwnLesson(teacherId, lessonContentId);
    }
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (lessonContentId !== undefined) updateData.lessonContentId = lessonContentId;
    if (timeLimitSeconds !== undefined) updateData.timeLimitSeconds = timeLimitSeconds;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (Object.keys(updateData).length === 0) {
      return error(res, "No fields to update", 400, "VALIDATION_ERROR");
    }
    const updated = await prisma.exam.update({
      where: { id: examId },
      data: updateData,
    });
    return success(res, { exam: updated });
  } catch (err) {
    next(err);
  }
}

async function deleteExam(req, res, next) {
  try {
    const examId = parseExamId(req.params.examId);
    await assertOwnExam(req.user.id, examId);
    await prisma.exam.delete({ where: { id: examId } });
    await prisma.logHistory.create({
      data: {
        actionType: "EXAM_DELETED",
        actorId: String(req.user.id),
        actorType: "TEACHER",
        targetId: String(examId),
        details: { teacherId: req.user.id },
      },
    });
    return success(res, { message: "Exam deleted successfully" });
  } catch (err) {
    next(err);
  }
}

async function getGrades(req, res, next) {
  try {
    const examId = parseExamId(req.params.examId);
    const exam = await assertOwnExam(req.user.id, examId);
    const attempts = await prisma.examAttempt.findMany({
      where: { examId },
      orderBy: { submittedAt: "desc" },
      select: {
        id: true,
        correct: true,
        total: true,
        percent: true,
        timedOut: true,
        submittedAt: true,
        student: { select: { id: true, name: true, username: true, email: true } },
      },
    });
    return success(res, {
      exam: { id: exam.id, title: exam.title },
      grades: attempts.map((a) => ({
        attemptId: a.id,
        student: a.student,
        correct: a.correct,
        total: a.total,
        percent: Number(a.percent.toString()),
        timedOut: a.timedOut,
        submittedAt: a.submittedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

// ---- Student role (active subscription required via route coverage) ----

async function listStudentExams(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const exams = await prisma.exam.findMany({
      where: { teacherId, isPublished: true },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        lessonContentId: true,
        timeLimitSeconds: true,
        createdAt: true,
        lesson: { select: { id: true, title: true, type: true } },
        _count: { select: { questions: true } },
        attempts: {
          where: { studentId: req.user.id },
          orderBy: { submittedAt: "desc" },
          take: 1,
          select: { percent: true, submittedAt: true },
        },
      },
    });
    return success(res, {
      exams: exams.map((e) => ({
        id: e.id,
        title: e.title,
        lessonContentId: e.lessonContentId,
        lesson: e.lesson,
        timeLimitSeconds: e.timeLimitSeconds,
        createdAt: e.createdAt,
        questionCount: e._count.questions,
        lastPercent: e.attempts.length ? Number(e.attempts[0].percent.toString()) : null,
        lastSubmittedAt: e.attempts.length ? e.attempts[0].submittedAt : null,
      })),
    });
  } catch (err) {
    next(err);
  }
}

async function getStudentExam(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const examId = parseExamId(req.params.examId);
    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    if (!exam || exam.teacherId !== teacherId || !exam.isPublished) {
      return error(res, "Exam not found", 404, "NOT_FOUND");
    }
    const attemptCount = await prisma.examAttempt.count({
      where: { examId, studentId: req.user.id },
    });
    return success(res, {
      exam: {
        id: exam.id,
        title: exam.title,
        lessonContentId: exam.lessonContentId,
        timeLimitSeconds: exam.timeLimitSeconds,
        // Correct answers are never exposed before submit.
        questions: exam.questions.map((q) => ({
          id: q.id,
          text: q.text,
          options: q.options,
          position: q.position,
        })),
        attemptCount,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function submitExam(req, res, next) {
  try {
    const teacherId = parseTeacherId(req.params.teacherId);
    const examId = parseExamId(req.params.examId);
    const teacher = await findActiveTeacher(teacherId);
    if (!teacher) {
      return error(res, "Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    if (!exam || exam.teacherId !== teacherId || !exam.isPublished) {
      return error(res, "Exam not found", 404, "NOT_FOUND");
    }
    const { answers, timedOut } = req.body;
    // Unanswered questions stay null and grade as incorrect.
    const normalized = exam.questions.map((_, i) =>
      Array.isArray(answers) && Number.isInteger(answers[i]) ? answers[i] : null
    );
    const result = gradeExam(exam.questions, normalized);
    const attempt = await prisma.examAttempt.create({
      data: {
        examId,
        studentId: req.user.id,
        answers: normalized,
        correct: result.correct,
        total: result.total,
        percent: result.percent,
        timedOut: timedOut === true,
      },
      select: { id: true, submittedAt: true },
    });
    await prisma.logHistory.create({
      data: {
        actionType: "EXAM_SUBMITTED",
        actorId: String(req.user.id),
        actorType: "STUDENT",
        targetId: String(examId),
        details: {
          teacherId,
          correct: result.correct,
          total: result.total,
          percent: result.percent,
          timedOut: timedOut === true,
        },
      },
    });
    return success(res, {
      result: {
        attemptId: attempt.id,
        correct: result.correct,
        total: result.total,
        percent: result.percent,
        timedOut: timedOut === true,
        submittedAt: attempt.submittedAt,
        review: exam.questions.map((q, i) => ({
          id: q.id,
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          chosen: normalized[i],
          isCorrect: result.details[i].isCorrect,
        })),
      },
    }, 201);
  } catch (err) {
    next(err);
  }
}

async function myPerformance(req, res, next) {
  try {
    if (!req.user || req.user.userType !== "student") {
      return error(res, "Only students can view exam performance", 403, "FORBIDDEN");
    }
    const attempts = await prisma.examAttempt.findMany({
      where: { studentId: req.user.id },
      orderBy: { submittedAt: "desc" },
      select: {
        examId: true,
        correct: true,
        total: true,
        percent: true,
        submittedAt: true,
        exam: { select: { id: true, title: true, teacherId: true } },
      },
    });
    const latestByExam = new Map();
    for (const a of attempts) {
      if (!latestByExam.has(a.examId)) {
        latestByExam.set(a.examId, {
          examId: a.examId,
          examTitle: a.exam ? a.exam.title : null,
          teacherId: a.exam ? a.exam.teacherId : null,
          correct: a.correct,
          total: a.total,
          percent: Number(a.percent.toString()),
          submittedAt: a.submittedAt,
        });
      }
    }
    const latest = [...latestByExam.values()];
    const average =
      latest.length === 0
        ? null
        : Math.round((latest.reduce((s, a) => s + a.percent, 0) / latest.length) * 100) / 100;
    return success(res, { attempts: latest, average, totalExams: latest.length });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listExams,
  getTeacherExam,
  createExam,
  updateExam,
  deleteExam,
  getGrades,
  listStudentExams,
  getStudentExam,
  submitExam,
  myPerformance,
};
