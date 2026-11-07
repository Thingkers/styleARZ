const AUTH_STORAGE_KEY = "sa-token";

export function readAuthToken() {
  try {
    const token = sessionStorage.getItem(AUTH_STORAGE_KEY);
    return typeof token === "string" && token.trim().length > 20 ? token : null;
  } catch {
    return null;
  }
}

export function writeAuthToken(token) {
  if (typeof token !== "string" || token.trim().length <= 20) return false;
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, token.trim());
    return true;
  } catch {
    return false;
  }
}

export function clearAuthToken() {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures and keep the app responsive.
  }
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  const token = readAuthToken();
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseText = await response.text();
  let data;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      if (response.ok) {
        const error = new Error("The server returned an invalid JSON response.");
        error.status = response.status;
        throw error;
      }
    }
  } else if (response.ok && response.status !== 204) {
    const error = new Error("The server returned an empty response.");
    error.status = response.status;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (HTTP ${response.status}).`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return undefined;
  return data;
}

export { AUTH_STORAGE_KEY };
