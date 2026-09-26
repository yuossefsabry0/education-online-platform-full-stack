// Centralized API layer for the Education System backend.
//
// Backend contract (verified against src/routes + controllers):
// - Base URL: <backend>/api (see VITE_API_BASE_URL)
// - Envelope: { success: true, data, error: null } on success,
//             { success: false, data, error: { code, message, details } } on failure.
// - Auth: "Authorization: Bearer <loginToken>" header. Login tokens live ~24h
//   (LOGIN_TOKEN_EXPIRES_IN); refresh tokens live ~7d and are revocable.
// - Roles (userType): "student" | "teacher" | "admin". Per-teacher access roles
//   are dynamic strings "SUB{teacherId}" derived from ACTIVE subscriptions.

import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const TOKEN_KEY = "edu.accessToken";
const REFRESH_KEY = "edu.refreshToken";
const USER_KEY = "edu.user";

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession({ token, refreshToken, user }) {
  if (token !== undefined) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
  if (refreshToken !== undefined) {
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
    else localStorage.removeItem(REFRESH_KEY);
  }
  if (user !== undefined) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }
}

export function updateAccessToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

const api = axios.create({ baseURL: API_BASE_URL });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Automatic refresh: on 401 (expired login token), try POST /auth/refresh
// once with the stored refresh token, then retry the original request.
// Auth endpoints themselves are never retried to avoid loops.
let refreshPromise = null;

async function refreshAccessTokenOnce() {
  if (!refreshPromise) {
    const refreshToken = getRefreshToken();
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refreshToken })
      .then((res) => {
        const data = res.data && res.data.data ? res.data.data : null;
        if (!data || !data.token) throw new Error("Refresh failed");
        updateAccessToken(data.token);
        if (data.user) {
          const prev = getStoredUser();
          setSession({ user: { ...(prev || {}), ...data.user } });
        }
        return data.token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function isAuthEndpoint(url) {
  return typeof url === "string" && url.includes("/auth/");
}

api.interceptors.response.use(
  (response) => response,
  async (err) => {
    const original = err.config || {};
    const status = err.response ? err.response.status : null;
    if (
      status === 401 &&
      !original._retry &&
      !isAuthEndpoint(original.url) &&
      getRefreshToken()
    ) {
      original._retry = true;
      try {
        const token = await refreshAccessTokenOnce();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshErr) {
        clearSession();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(err);
  }
);

// Unwrap the backend success envelope -> res.data.data
export function unwrap(res) {
  return res.data ? res.data.data : null;
}

// Normalize a backend/axios failure into { status, code, message, details }
export function toApiError(err) {
  const status = err && err.response ? err.response.status : null;
  const payload = err && err.response && err.response.data ? err.response.data : null;
  const backendError = payload && payload.error ? payload.error : null;
  if (backendError) {
    return {
      status,
      code: backendError.code || "ERROR",
      message: backendError.message || "Something went wrong",
      details: backendError.details || null,
    };
  }
  if (err && err.code === "ERR_NETWORK") {
    return {
      status: null,
      code: "NETWORK_ERROR",
      message: `Cannot reach the backend at ${API_BASE_URL}. Is the server running and is this origin allowed by CORS?`,
      details: null,
    };
  }
  return {
    status,
    code: "ERROR",
    message: (err && err.message) || "Something went wrong",
    details: null,
  };
}

function paramsSerializer(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, String(value));
  }
  return search.toString();
}

async function get(path, params) {
  const res = await api.get(path, { params, paramsSerializer: { serialize: paramsSerializer } });
  return unwrap(res);
}

async function post(path, body) {
  const res = await api.post(path, body);
  return unwrap(res);
}

async function put(path, body) {
  const res = await api.put(path, body);
  return unwrap(res);
}

async function del(path) {
  const res = await api.delete(path);
  return unwrap(res);
}

export const endpoints = {
  // POST /api/auth/register { name, username, email, password }
  register: (body) => post("/auth/register", body),
  // POST /api/auth/login { userType, username, password }
  login: (body) => post("/auth/login", body),
  // POST /api/auth/refresh { refreshToken }
  refresh: (body) => post("/auth/refresh", body),
  // POST /api/auth/logout { refreshToken }
  logout: (body) => post("/auth/logout", body),

  // GET /api/contact/ -> { message }
  contact: () => get("/contact/"),

  // GET /api/teachers?page&limit&sortBy&sortOrder
  listTeachers: (params) => get("/teachers", params),
  // GET /api/teachers/search?q&page&limit&sortBy&sortOrder
  searchTeachers: (params) => get("/teachers/search", params),
  // GET /api/teachers/:teacherId/content (auth + SUB{teacherId} coverage)
  teacherContentIndex: (teacherId) => get(`/teachers/${teacherId}/content`),

  // GET /api/user/me -> { user, activeRoles }
  me: () => get("/user/me"),

  // GET /api/subscriptions/teacher/:teacherId (students only)
  subscriptionPlans: (teacherId) => get(`/subscriptions/teacher/${teacherId}`),
  // POST /api/subscriptions/confirm-payment { teacherId, duration }
  confirmPayment: (body) => post("/subscriptions/confirm-payment", body),

  // GET /api/content/teacher/:teacherId (subscribed students)
  contentPage: (teacherId) => get(`/content/teacher/${teacherId}`),
  // GET /api/content/teacher/:teacherId/:section
  // section: lectures | lesson-content | homework
  contentSection: (teacherId, section) => get(`/content/teacher/${teacherId}/${section}`),

  // Teacher role routes (userType === "teacher")
  teacherDashboard: () => get("/teacher/dashboard"),
  teacherSubscribers: () => get("/teacher/dashboard/subscribers"),
  teacherIncome: () => get("/teacher/dashboard/income"),
  teacherAddContent: (body) => post("/teacher/dashboard/content", body),
  teacherEditContent: (contentId, body) => put(`/teacher/dashboard/content/${contentId}`, body),
  teacherDeleteContent: (contentId) => del(`/teacher/dashboard/content/${contentId}`),

  // Admin routes (userType === "admin")
  adminSubscribers: (params) => get("/admin/subscribers", params),
  adminTeacherSubscribers: (teacherId, params) => get(`/admin/teachers/${teacherId}/subscribers`, params),
  adminIncome: () => get("/admin/income"),
  adminTeacherDetail: (teacherId) => get(`/admin/teachers/${teacherId}`),
  adminEditTeacher: (teacherId, body) => put(`/admin/teachers/${teacherId}`, body),
  adminAddTeacher: (body) => post("/admin/teachers", body),
  adminDeleteTeacher: (teacherId) => del(`/admin/teachers/${teacherId}`),
  adminAddContent: (teacherId, body) => post(`/admin/teachers/${teacherId}/content`, body),
  adminEditContent: (teacherId, contentId, body) => put(`/admin/teachers/${teacherId}/content/${contentId}`, body),
  adminDeleteContent: (teacherId, contentId) => del(`/admin/teachers/${teacherId}/content/${contentId}`),
  adminLogs: (params) => get("/admin/logs", params),
  adminCancelSubscription: (subscriptionId) => post(`/admin/subscriptions/${subscriptionId}/cancel`, {}),
};

export default api;
