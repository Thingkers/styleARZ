import { createContext, useContext, useEffect, useState } from "react";
import { api, clearAuthToken, readAuthToken, writeAuthToken } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = readAuthToken();
    if (!token) {
      setReady(true);
      return;
    }

    api("/api/auth/me")
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          return;
        }
        clearAuthToken();
        setUser(null);
      })
      .catch((error) => {
        if (error?.status === 401 || error?.status === 403) {
          clearAuthToken();
          setUser(null);
        }
      })
      .finally(() => setReady(true));
  }, []);

  async function login(email, password) {
    const data = await api("/api/auth/login", { method: "POST", body: { email, password } });
    if (!data?.token || typeof data.token !== "string") {
      throw new Error("Authentication failed. Please try again.");
    }
    writeAuthToken(data.token);
    setUser(data.user || null);
    return data.user;
  }

  async function signup(payload) {
    const data = await api("/api/auth/signup", { method: "POST", body: payload });
    if (!data?.token || typeof data.token !== "string") {
      throw new Error("Account created, but a session token was not returned.");
    }
    writeAuthToken(data.token);
    setUser(data.user || null);
    return data.user;
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    } catch {
      // Best-effort logout; the server may not expose a dedicated logout endpoint.
    } finally {
      clearAuthToken();
      setUser(null);
    }
  }

  function updateUser(next) {
    setUser(next);
  }

  return (
    <AuthContext.Provider value={{ user, ready, login, signup, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
