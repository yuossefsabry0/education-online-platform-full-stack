require("dotenv").config();

const bcrypt = require("bcryptjs");
const prisma = require("../src/db/prisma");

const TEACHERS = [
  {
    id: 1,
    name: "Ahmed",
    username: "ahmed",
    email: "ahmed@education-system.dev",
    subject: "Arabic",
    gradeClass: "3rd year secondary grade",
    basePrice: 80,
  },
  {
    id: 2,
    name: "Youssef",
    username: "youssef",
    email: "youssef@education-system.dev",
    subject: "English",
    gradeClass: "3rd year preparatory grade",
    basePrice: 50,
  },
  {
    id: 3,
    name: "Carlos",
    username: "carlos",
    email: "carlos@education-system.dev",
    subject: "Spanish",
    gradeClass: "1st year secondary grade",
    basePrice: 100,
  },
];

const PRICE_MULTIPLIERS = {
  price1Month: 1,
  price3Months: 2.7,
  price6Months: 5,
  price1Year: 9,
};

const round2 = (n) => Math.round(n * 100) / 100;

function computePrices(basePrice) {
  const prices = {};
  for (const [field, multiplier] of Object.entries(PRICE_MULTIPLIERS)) {
    prices[field] = round2(basePrice * multiplier).toFixed(2);
  }
  return prices;
}

async function seedAdmin(passwordHash) {
  const username = process.env.SEED_ADMIN_USERNAME || "admin";
  const email = process.env.SEED_ADMIN_EMAIL || "admin@education-system.dev";

  await prisma.admin.upsert({
    where: { username },
    update: {},
    create: { username, email, password: passwordHash },
  });

  console.log(`Admin seeded: ${username} (${email})`);
}

async function seedTeachers(passwordHash) {
  for (const teacher of TEACHERS) {
    await prisma.teacher.upsert({
      where: { username: teacher.username },
      update: {},
      create: {
        id: teacher.id,
        name: teacher.name,
        username: teacher.username,
        email: teacher.email,
        password: passwordHash,
        subject: teacher.subject,
        gradeClass: teacher.gradeClass,
        ...computePrices(teacher.basePrice),
      },
    });
    console.log(
      `Teacher seeded: ${teacher.name} — ${teacher.subject} (${teacher.gradeClass}), base \$${teacher.basePrice}`
    );
  }
}

async function seedStudent() {
  if (process.env.SEED_SAMPLE_STUDENT !== "true") {
    return;
  }

  const name = process.env.SEED_STUDENT_NAME || "Sample Student";
  const username = process.env.SEED_STUDENT_USERNAME || "student1";
  const email = process.env.SEED_STUDENT_EMAIL || "student1@education-system.dev";
  const password = process.env.SEED_STUDENT_PASSWORD || "student123";
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.student.upsert({
    where: { username },
    update: {},
    create: { name, username, email, password: passwordHash },
  });

  console.log(`Student seeded: ${name} (${username})`);
}

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const teacherPassword = process.env.SEED_TEACHER_PASSWORD || "teacher123";
  const teacherPasswordHash = await bcrypt.hash(teacherPassword, 10);

  await seedAdmin(adminPasswordHash);
  await seedTeachers(teacherPasswordHash);
  await seedStudent();

  console.log("Seeding finished.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });