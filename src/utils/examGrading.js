// Pure exam-grading helper (no I/O, fully unit-testable).
// - questions: [{ id, correctIndex }] in exam order
// - answers: chosen option index per question; null/undefined/out-of-range
//   counts as unanswered and is marked incorrect.
function gradeExam(questions, answers) {
  const list = Array.isArray(questions) ? questions : [];
  const given = Array.isArray(answers) ? answers : [];
  const details = list.map((q, i) => {
    const chosen = given[i] === undefined ? null : given[i];
    const isCorrect =
      Number.isInteger(chosen) && chosen === q.correctIndex;
    return {
      questionId: q.id,
      chosen,
      correctIndex: q.correctIndex,
      isCorrect,
    };
  });
  const correct = details.filter((d) => d.isCorrect).length;
  const total = details.length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 10000) / 100;
  return { correct, total, percent, details };
}

module.exports = { gradeExam };
