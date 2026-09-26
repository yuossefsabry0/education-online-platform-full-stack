// Test-data fixtures for the Supertest integration suite.
// These are written DIRECTLY into the fresh test database (they are not the
// Task-1 seed data, so assertions are fully deterministic). Each fixture
// returns the created records so tests can reference IDs.
const bcrypt = require("bcryptjs");
const prisma = require("../../src/db/prisma");

const HASH_ROUNDS = 4; // low cost: fixtures run fast, real registration uses 10

const ADMIN = {
  username: "admin",
  email: "admin@test.dev",
  password: "admin123",
};

const TEACHER_A = {
  name: "Alpha Teacher",
  username: "alpha_teacher",
  email: "alpha@test.dev",
  password: "teacher123",
  subject: "Math",
  gradeClass: "1st year secondary grade",
  price1Month: 60,
  price3Months: 162,
  price6Months: 300,
  price1Year: 540,
};

const TEACHER_B = {
  name: "Beta Teacher",
  username: "beta_teacher",
  email: "beta@test.dev",
  password: "teacher123",
  subject: "English",
  gradeClass: "2nd year preparatory grade",
  price1Month: 50,
  price3Months: 135,
  price6Months: 250,
  price1Year: 450,
};

async function hash(password) {
  return bcrypt.hash(password, HASH_ROUNDS);
}

async function seedAdmin() {
  await prisma.admin.create({
    data: {
      username: ADMIN.username,
      email: ADMIN.email,
      password: await hash(ADMIN.password),
    },
  });
  return ADMIN;
}

async function seedTeacher(def) {
  const teacher = await prisma.teacher.create({
    data: {
      ...def,
      password: await hash(def.password),
    },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      subject: true,
      gradeClass: true,
      price1Month: true,
      price3Months: true,
      price6Months: true,
      price1Year: true,
    },
  });
  return teacher;
}

// Seeds the minimal base set used across the whole integration suite.
async function seedBaseFixtures() {
  await seedAdmin();
  const teacherA = await seedTeacher(TEACHER_A);
  const teacherB = await seedTeacher(TEACHER_B);
  return { admin: ADMIN, teacherA, teacherB };
}

async function cleanupDatabase() {
  // Order matters because of foreign keys: children before parents.
  await prisma.refreshToken.deleteMany();
  await prisma.logHistory.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.teacherContent.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.admin.deleteMany();
}

module.exports = {
  ADMIN,
  TEACHER_A,
  TEACHER_B,
  seedAdmin,
  seedTeacher,
  seedBaseFixtures,
  cleanupDatabase,
};