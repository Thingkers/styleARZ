export const QUIZ_STORAGE_KEY = "sa-quiz";

function isQuizPayload(value) {
  return !!value && typeof value === "object" && ("result" in value || "products" in value);
}

export function readStoredQuiz() {
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isQuizPayload(parsed)) {
      localStorage.removeItem(QUIZ_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Could not read saved quiz from localStorage.", error);
    localStorage.removeItem(QUIZ_STORAGE_KEY);
    return null;
  }
}

export function writeStoredQuiz(value) {
  try {
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearStoredQuiz() {
  try {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
  } catch {
    // Ignore storage write failures.
  }
}
