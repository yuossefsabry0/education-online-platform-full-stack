// Pure text-matching helpers used by the teacher search (and testable in
// isolation). Kept in a dedicated util so unit tests can cover them directly.

// Lowercase, trim, collapse whitespace, and strip accent marks so "Ahmad",
// "ahmad", " AHMAD " all match each other.
function normalizeForMatch(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// Classic Levenshtein edit-distance: minimum single-character insertions,
// deletions or substitutions to turn `a` into `b`.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...Array(b.length).fill(0)];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

module.exports = { normalizeForMatch, levenshtein };