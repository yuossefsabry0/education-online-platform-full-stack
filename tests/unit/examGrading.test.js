const { gradeExam } = require("../../src/utils/examGrading");
const { createExamSchema, submitExamSchema } = require("../../src/validations/exam.schema");

const questions = [
  { id: 1, correctIndex: 2 },
  { id: 2, correctIndex: 0 },
  { id: 3, correctIndex: 3 },
];

describe("examGrading util", () => {
  it("marks all-correct answers as 100%", () => {
    const result = gradeExam(questions, [2, 0, 3]);
    expect(result).toEqual({
      correct: 3,
      total: 3,
      percent: 100,
      details: [
        { questionId: 1, chosen: 2, correctIndex: 2, isCorrect: true },
        { questionId: 2, chosen: 0, correctIndex: 0, isCorrect: true },
        { questionId: 3, chosen: 3, correctIndex: 3, isCorrect: true },
      ],
    });
  });

  it("marks unanswered (null) questions as incorrect", () => {
    const result = gradeExam(questions, [2, null, undefined]);
    expect(result.correct).toBe(1);
    expect(result.total).toBe(3);
    expect(result.percent).toBeCloseTo(33.33, 2);
    expect(result.details[1].isCorrect).toBe(false);
    expect(result.details[2].chosen).toBe(null);
  });

  it("marks out-of-range answers as incorrect", () => {
    const result = gradeExam(questions, [2, 0, 99]);
    expect(result.correct).toBe(2);
    expect(result.percent).toBeCloseTo(66.67, 2);
  });

  it("handles empty exams without dividing by zero", () => {
    expect(gradeExam([], [])).toEqual({ correct: 0, total: 0, percent: 0, details: [] });
  });
});

describe("exam validation schemas", () => {
  const validBody = {
    title: "Lesson 1 exam",
    lessonContentId: 7,
    timeLimitSeconds: 600,
    isPublished: true,
    questions: [
      { text: "2 + 2?", options: ["3", "4", "5"], correctIndex: 1 },
    ],
  };

  it("accepts a valid exam payload", () => {
    expect(createExamSchema.safeParse(validBody).success).toBe(true);
  });

  it("rejects a correct answer outside the options", () => {
    const parsed = createExamSchema.safeParse({
      ...validBody,
      questions: [{ text: "Q?", options: ["A", "B"], correctIndex: 5 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects exams without questions", () => {
    expect(createExamSchema.safeParse({ ...validBody, questions: [] }).success).toBe(false);
  });

  it("accepts sparse answers on submit (unanswered = incorrect)", () => {
    const parsed = submitExamSchema.safeParse({ answers: [1, null], timedOut: true });
    expect(parsed.success).toBe(true);
  });
});
