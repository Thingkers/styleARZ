export const QUIZ_STORAGE_KEY = "sa-quiz";

function isQuizPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const { result, products } = value;
  return (
    !!result &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    typeof result.title === "string" &&
    typeof result.summary === "string" &&
    !!result.answers &&
    typeof result.answers === "object" &&
    !Array.isArray(result.answers) &&
    Array.isArray(result.productIds) &&
    Array.isArray(products) &&
    products.every(
      (product) =>
        !!product &&
        typeof product === "object" &&
        !Array.isArray(product) &&
        typeof product.id === "string" &&
        Number.isFinite(product.price)
    )
  );
}

export function readStoredQuiz() {
  try {
    const raw = localStorage.getItem(QUIZ_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isQuizPayload(parsed)) {
      console.warn("Saved quiz data has an unexpected format; leaving it untouched.");
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Could not read saved quiz from localStorage.", error);
    return null;
  }
}

export function writeStoredQuiz(value) {
  if (!isQuizPayload(value)) {
    throw new TypeError("Quiz result has an unexpected format and cannot be saved.");
  }

  try {
    localStorage.setItem(QUIZ_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn("Could not save quiz result to localStorage.", error);
    throw new Error("Could not save your edit in this browser. Check storage availability and try again.");
  }
}

export function clearStoredQuiz() {
  try {
    localStorage.removeItem(QUIZ_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not clear saved quiz from localStorage.", error);
    throw new Error("Could not clear your saved edit in this browser. Check storage availability and try again.");
  }
}
