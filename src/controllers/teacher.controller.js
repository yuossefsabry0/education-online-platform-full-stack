const prisma = require("../db/prisma");
const { success } = require("../utils/apiResponse");
const { httpError } = require("../utils/httpError");
const { normalizeForMatch, levenshtein } = require("../utils/textSearch");
const {
  listTeachersQuerySchema,
  searchTeachersQuerySchema,
} = require("../validations/teacher.schema");

const PUBLIC_TEACHER_SELECT = {
  id: true,
  name: true,
  subject: true,
  gradeClass: true,
  photoUrl: true,
};

const FULL_TEACHER_SELECT = {
  id: true,
  name: true,
  username: true,
  email: true,
  subject: true,
  gradeClass: true,
  photoUrl: true,
  price1Month: true,
  price3Months: true,
  price6Months: true,
  price1Year: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

function isAdminRequest(req) {
  return !!(req.user && req.user.userType === "admin");
}

function teacherSelectFor(req) {
  return isAdminRequest(req) ? FULL_TEACHER_SELECT : PUBLIC_TEACHER_SELECT;
}

function teacherWhereFor(req) {
  return isAdminRequest(req) ? {} : { isActive: true };
}

function parseQuery(schema, raw) {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join(".") || "query",
      message: issue.message,
    }));
    throw httpError(400, "VALIDATION_ERROR", "Validation failed", details);
  }
  return result.data;
}

function buildPagination(total, page, limit) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  };
}

// Fuzzy (typo-tolerant) fallback used only when the direct partial-name
// search returns nothing, so large tables stay fast in the common path.
async function fuzzyMatchTeachers({ query, select, where, limit }) {
  const normalizedQ = normalizeForMatch(query);
  if (!normalizedQ) return { total: 0, items: [] };

  const candidates = await prisma.teacher.findMany({
    where,
    select: { ...select, name: true },
  });

  const threshold = Math.max(1, Math.min(2, Math.round(normalizedQ.length / 3)));

  const scored = [];
  for (const teacher of candidates) {
    const normalizedName = normalizeForMatch(teacher.name);
    if (
      normalizedName.includes(normalizedQ) ||
      normalizedQ.includes(normalizedName)
    ) {
      scored.push({ teacher, distance: 0 });
    } else {
      const distance = levenshtein(normalizedName, normalizedQ);
      if (distance <= threshold) {
        scored.push({ teacher, distance });
      }
    }
  }

  scored.sort(
    (a, b) => a.distance - b.distance || a.teacher.id - b.teacher.id
  );

  return {
    total: scored.length,
    items: scored
      .slice(0, limit)
      .map(({ teacher }) => teacher),
  };
}

async function listTeachers(req, res) {
  const query = parseQuery(listTeachersQuerySchema, req.query);
  const select = teacherSelectFor(req);
  const where = teacherWhereFor(req);

  const [total, teachers] = await Promise.all([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      select,
      orderBy: { [query.sortBy]: query.sortOrder },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return success(res, {
    teachers,
    pagination: buildPagination(total, query.page, query.limit),
    fullData: isAdminRequest(req),
  });
}

async function searchTeachers(req, res) {
  const query = parseQuery(searchTeachersQuerySchema, req.query);
  const q = query.q.trim();
  const select = teacherSelectFor(req);
  const whereBase = teacherWhereFor(req);

  let teachers = [];
  let total = 0;

  if (q) {
    const tokens = normalizeForMatch(q).split(/\s+/).filter(Boolean);
    const candidates = await prisma.teacher.findMany({
      where: whereBase,
      select: { ...select, name: true },
    });
    const matched = candidates.filter((t) => {
      const n = normalizeForMatch(t.name || "");
      return tokens.every((tok) => n.includes(tok));
    });
    const dir = query.sortOrder === "desc" ? -1 : 1;
    const key = query.sortBy;
    matched.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av === bv) return a.id - b.id;
      if (av === undefined || av === null) return 1;
      if (bv === undefined || bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir || a.id - b.id;
    });
    total = matched.length;

    if (total === 0) {
      const fuzzy = await fuzzyMatchTeachers({
        query: q,
        select,
        where: whereBase,
        limit: query.limit,
      });
      teachers = fuzzy.items;
      total = fuzzy.total;
    } else {
      const start = (query.page - 1) * query.limit;
      teachers = matched.slice(start, start + query.limit);
    }
  }

  return success(res, {
    query: q,
    teachers,
    pagination: buildPagination(total, query.page, query.limit),
    fullData: isAdminRequest(req),
  });
}

module.exports = { listTeachers, searchTeachers };