import axios from "axios";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

const USER_KEY = "edu.user";

let memoryToken = null;

export function getAccessToken() {
  return memoryToken;
}

export function getRefreshToken() {
  return null;
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setSession({ token, user }) {
  if (token !== undefined) {
    memoryToken = token || null;
  }
  if (user !== undefined) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  }
}

export function updateAccessToken(token) {
  memoryToken = token || null;
}

export function clearSession() {
  memoryToken = null;
  localStorage.removeItem(USER_KEY);
}

export function notifySessionExpired() {
  try {
    const from =
      typeof window !== "undefined" && window.location
        ? window.location.pathname + window.location.search
        : null;
    window.dispatchEvent(
      new CustomEvent("edu:session-expired", { detail: { from } })
    );
  } catch {
    return;
  }
}

const api = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise = null;

// Single-flight access-token refresh shared by the interceptor and the auth
// revalidation below, so concurrent callers reuse one rotation request.
export async function refreshAccessTokenOnce() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true })
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
    if (status === 401 && !original._retry && !isAuthEndpoint(original.url)) {
      original._retry = true;
      try {
        const token = await refreshAccessTokenOnce();
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (refreshErr) {
        clearSession();
        notifySessionExpired();
        try {
          Object.defineProperty(err, "refreshError", { value: refreshErr, configurable: true });
        } catch {}
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export function unwrap(res) {
  return res.data ? res.data.data : null;
}

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

async function get(path, params, options) {
  const res = await api.get(path, { params, paramsSerializer: { serialize: paramsSerializer }, signal: options ? options.signal : undefined });
  return unwrap(res);
}

async function post(path, body, options) {
  const res = await api.post(path, body, { signal: options ? options.signal : undefined });
  return unwrap(res);
}

async function put(path, body, options) {
  const res = await api.put(path, body, { signal: options ? options.signal : undefined });
  return unwrap(res);
}

async function del(path, options) {
  const res = await api.delete(path, { signal: options ? options.signal : undefined });
  return unwrap(res);
}

async function uploadFile(path, file, options) {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post(path, form, { signal: options ? options.signal : undefined });
  return unwrap(res);
}

export async function downloadStoredFile(fileUrl, options) {
  const target = typeof fileUrl === "string" ? fileUrl.replace(/^\/api(?=\/)/, "") : fileUrl;
  const res = await api.get(target, { responseType: "blob", signal: options ? options.signal : undefined, params: options ? options.params : undefined });
  return res.data;
}

export function isSafeFileUrl(value) {
  if (typeof value !== "string") return false;
  if (/^\s*(javascript|vbscript)\s*:/i.test(value)) return false;
  const trimmed = value.trim();
  if (/^\/api\/files\/[a-f0-9]{32}\.[a-z0-9]+$/.test(trimmed)) return true;
  return /^https:\/\//i.test(trimmed) || /^http:\/\//i.test(trimmed);
}

export const endpoints = {
  register: (body) => post("/auth/register", body),
  login: (body) => post("/auth/login", body),
  refresh: () => post("/auth/refresh", {}),
  logout: (body) => post("/auth/logout", body || {}),
  changePassword: (body) => put("/auth/password", body),
  requestPasswordReset: (body) => post("/auth/password-reset/request", body),
  confirmPasswordReset: (body) => post("/auth/password-reset/confirm", body),
  resendVerification: (body) => post("/auth/verify-email/resend", body),
  confirmVerification: (body) => post("/auth/verify-email/confirm", body),

  contact: () => get("/contact/"),

  listTeachers: (params) => get("/teachers", params),
  searchTeachers: (params) => get("/teachers/search", params),

  me: () => get("/user/me"),
  history: (params) => get("/user/history", params),
  notifications: (params) => get("/user/notifications", params),

  subscriptionPlans: (teacherId) => get(`/subscriptions/teacher/${teacherId}`),
  confirmPayment: (body) => post("/subscriptions/confirm-payment", body),
  subscriptionWebhook: (body) => post("/subscriptions/webhook", body),
  cancelSubscription: (subscriptionId) => post(`/subscriptions/${subscriptionId}/cancel`, {}),
  mySubscriptions: () => get("/subscriptions/mine"),

  contentPage: (teacherId) => get(`/content/teacher/${teacherId}`),
  contentSection: (teacherId, section, params) => get(`/content/teacher/${teacherId}/${section}`, params),

  teacherDashboard: (params) => get("/teacher/dashboard", params),
  teacherSubscribers: (params) => get("/teacher/dashboard/subscribers", params),
  teacherIncome: () => get("/teacher/dashboard/income"),
  teacherAddContent: (body) => post("/teacher/dashboard/content", body),
  teacherEditContent: (contentId, body) => put(`/teacher/dashboard/content/${contentId}`, body),
  teacherDeleteContent: (contentId) => del(`/teacher/dashboard/content/${contentId}`),
  teacherUploadContent: (file) => uploadFile("/teacher/dashboard/content/upload", file),

  teacherExams: () => get("/teacher/dashboard/exams"),
  teacherExamDetail: (examId) => get(`/teacher/dashboard/exams/${examId}`),
  teacherAddExam: (body) => post("/teacher/dashboard/exams", body),
  teacherEditExam: (examId, body) => put(`/teacher/dashboard/exams/${examId}`, body),
  teacherDeleteExam: (examId) => del(`/teacher/dashboard/exams/${examId}`),
  teacherExamGrades: (examId) => get(`/teacher/dashboard/exams/${examId}/grades`),

  studentExams: (teacherId) => get(`/content/teacher/${teacherId}/exams`),
  studentExam: (teacherId, examId) => get(`/content/teacher/${teacherId}/exams/${examId}`),
  studentSubmitExam: (teacherId, examId, body) => post(`/content/teacher/${teacherId}/exams/${examId}/submit`, body),
  lectureJourney: (teacherId, lectureId) => get(`/content/teacher/${teacherId}/lectures/${lectureId}/journey`),
  recordLectureWatch: (teacherId, lectureId, body) => post(`/content/teacher/${teacherId}/lectures/${lectureId}/watch`, body || {}),
  examPerformance: () => get("/user/exams/performance"),

  adminSubscribers: (params) => get("/admin/subscribers", params),
  adminTeacherSubscribers: (teacherId, params) => get(`/admin/teachers/${teacherId}/subscribers`, params),
  adminIncome: () => get("/admin/income"),
  adminTeacherDetail: (teacherId) => get(`/admin/teachers/${teacherId}`),
  adminEditTeacher: (teacherId, body) => put(`/admin/teachers/${teacherId}`, body),
  adminAddTeacher: (body) => post("/admin/teachers", body),
  adminDeleteTeacher: (teacherId) => del(`/admin/teachers/${teacherId}`),
  adminAddContent: (teacherId, body) => post(`/admin/teachers/${teacherId}/content`, body),
  adminUploadContent: (teacherId, file) => uploadFile(`/admin/teachers/${teacherId}/content/upload`, file),
  adminEditContent: (teacherId, contentId, body) => put(`/admin/teachers/${teacherId}/content/${contentId}`, body),
  adminDeleteContent: (teacherId, contentId) => del(`/admin/teachers/${teacherId}/content/${contentId}`),
  adminLogs: (params) => get("/admin/logs", params),
  adminBroadcast: (body) => post("/admin/notifications", body),
  adminCancelSubscription: (subscriptionId) => post(`/admin/subscriptions/${subscriptionId}/cancel`, {}),
};

export default api;
