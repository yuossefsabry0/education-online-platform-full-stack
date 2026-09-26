import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  clearSession,
  endpoints,
  getRefreshToken,
  getStoredUser,
  setSession,
  toApiError,
} from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [authenticating, setAuthenticating] = useState(true);

  // On load: if a session exists, re-validate it against GET /user/me.
  // The api layer refreshes an expired login token automatically.
  useEffect(() => {
    let cancelled = false;
    async function revalidate() {
      if (!getStoredUser()) {
        setAuthenticating(false);
        return;
      }
      try {
        const data = await endpoints.me();
        if (!cancelled && data && data.user) {
          const merged = { ...getStoredUser(), ...data.user, activeRoles: data.activeRoles };
          setUser(merged);
          setSession({ user: merged });
        }
      } catch {
        if (!cancelled) {
          clearSession();
          setUser(null);
        }
      } finally {
        if (!cancelled) setAuthenticating(false);
      }
    }
    revalidate();
    return () => {
      cancelled = true;
    };
  }, []);

  // POST /api/auth/login { userType, username, password }
  // -> { token, tokenType, expiresIn, refreshToken, user }
  const login = useCallback(async ({ userType, username, password }) => {
    try {
      const data = await endpoints.login({ userType, username, password });
      setSession({ token: data.token, refreshToken: data.refreshToken, user: data.user });
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: toApiError(err) };
    }
  }, []);

  // POST /api/auth/register { name, username, email, password }
  const register = useCallback(async ({ name, username, email, password }) => {
    try {
      const data = await endpoints.register({ name, username, email, password });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toApiError(err) };
    }
  }, []);

  // POST /api/auth/logout { refreshToken } (revokes server-side), then clear local.
  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await endpoints.logout({ refreshToken });
      } catch {
        // Still clear the local session even if revocation fails.
      }
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      userType: user ? user.userType : null,
      authenticating,
      login,
      register,
      logout,
    }),
    [user, authenticating, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
