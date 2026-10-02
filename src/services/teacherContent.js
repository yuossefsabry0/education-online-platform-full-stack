const prisma = require("../db/prisma");
const { deriveTeacherRole } = require("../utils/teacherRole");
const { normalizeForMatch } = require("../utils/textSearch");

const TEACHER_INFO_SELECT = {
  id: true,
  name: true,
  subject: true,
  gradeClass: true,
};

const SECTION_DEFS = [
  { key: "lectures", label: "Lectures", type: "LECTURE" },
  { key: "lesson-content", label: "Lesson Content", type: "LESSON_CONTENT" },
  { key: "homework", label: "Homework", type: "HOMEWORK" },
];

async function findActiveTeacher(teacherId) {
  return prisma.teacher.findFirst({
    where: { id: teacherId, isActive: true },
    select: TEACHER_INFO_SELECT,
  });
}

async function listPublishedContent(teacherId) {
  return prisma.teacherContent.findMany({
    where: { teacherId, isPublished: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, title: true, body: true, fileUrl: true, createdAt: true },
  });
}

async function listPublishedIndex(teacherId) {
  return prisma.teacherContent.findMany({
    where: { teacherId, isPublished: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, type: true, title: true, createdAt: true },
  });
}

async function listPublishedSectionContent(teacherId, contentType) {
  return prisma.teacherContent.findMany({
    where: { teacherId, type: contentType, isPublished: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, title: true, body: true, fileUrl: true, type: true, createdAt: true },
  });
}

function sectionDefFor(section) {
  return SECTION_DEFS.find((item) => item.key === section);
}

function roleFor(teacherId) {
  return deriveTeacherRole(teacherId);
}

function filterContentByTitle(items, q) {
  const query = normalizeForMatch(q || "");
  if (!query) return items;
  return items.filter((item) => normalizeForMatch(item.title || "").includes(query));
}

function paginateItems(items, page, limit) {
  const total = items.length;
  const start = (page - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

module.exports = {
  TEACHER_INFO_SELECT,
  SECTION_DEFS,
  findActiveTeacher,
  listPublishedContent,
  listPublishedIndex,
  listPublishedSectionContent,
  sectionDefFor,
  roleFor,
  filterContentByTitle,
  paginateItems,
};
