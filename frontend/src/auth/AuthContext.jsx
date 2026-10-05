import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  clearSession,
  endpoints,
  getAccessToken,
  getStoredUser,
  refreshAccessTokenOnce,
  setSession,
  toApiError,
} from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser());
  const [authenticating, setAuthenticating] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function revalidate() {
      const stored = getStoredUser();
      try {
        if (!getAccessToken()) {
          try {
            // Single-flight refresh shared with the api interceptor: the backend
            // rotates single-use refresh tokens (family revoked on reuse), so two
            // concurrent rotations on page reload logged the user out.
            await refreshAccessTokenOnce();
            const refreshedUser = getStoredUser();
            if (refreshedUser && !cancelled) setUser(refreshedUser);
          } catch (err) {
            const status = err && err.response ? err.response.status : null;
            // Only a definitive rejection ends the session here; transient
            // failures keep the stored user so refresh doesn't log out.
            if ((status === 400 || status === 401) && stored) {
              clearSession();
              if (!cancelled) setUser(null);
            }
            if (!cancelled) setAuthenticating(false);
            return;
          }
        }
        const data = await endpoints.me();
        if (!cancelled && data && data.user) {
          const merged = { ...(stored || {}), ...data.user, activeRoles: data.activeRoles };
          setUser(merged);
          setSession({ user: merged });
        } else if (!cancelled && !stored) {
          setUser(null);
        }
      } catch (err) {
        // Only a definitive 401 ends the session here (the interceptor already
        // retried refresh); transient failures must not log the user out.
        const status = err && err.response ? err.response.status : null;
        if (!cancelled && status === 401) {
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

  useEffect(() => {
    function onExpired(e) {
      clearSession();
      setUser(null);
      const from = e && e.detail && e.detail.from ? e.detail.from : null;
      navigate("/login", { replace: true, state: from ? { from } : undefined });
    }
    window.addEventListener("edu:session-expired", onExpired);
    return () => window.removeEventListener("edu:session-expired", onExpired);
  }, [navigate]);

  const login = useCallback(async ({ userType, username, password }) => {
    try {
      const data = await endpoints.login({ userType, username, password });
      setSession({ token: data.token, user: data.user });
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: toApiError(err) };
    }
  }, []);

  const register = useCallback(async ({ name, username, email, password }) => {
    try {
      const data = await endpoints.register({ name, username, email, password });
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: toApiError(err) };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await endpoints.logout();
    } catch {
      return;
    } finally {
      clearSession();
      setUser(null);
    }
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
