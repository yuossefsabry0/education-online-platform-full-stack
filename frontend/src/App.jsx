import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminIncome from "./pages/AdminIncome.jsx";
import AdminLogs from "./pages/AdminLogs.jsx";
import AdminSubscribers from "./pages/AdminSubscribers.jsx";
import AdminTeacherDetail from "./pages/AdminTeacherDetail.jsx";
import AdminTeachers from "./pages/AdminTeachers.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import MyHistory from "./pages/MyHistory.jsx";
import MyLectures from "./pages/MyLectures.jsx";
import MySubscriptions from "./pages/MySubscriptions.jsx";
import NotFound from "./pages/NotFound.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import ResetPassword from "./pages/ResetPassword.jsx";
import Subscribe from "./pages/Subscribe.jsx";
import TeacherContent from "./pages/TeacherContent.jsx";
import LectureJourney from "./pages/LectureJourney.jsx";
import ExamTake from "./pages/ExamTake.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import Teachers from "./pages/Teachers.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import { ErrorBoundary, ToastProvider } from "./components/Toast.jsx";

// Footer contact links (icons from Simple Icons).
const SUPPORT_EMAIL = "test@test.test";
// TODO: replace with the actual WhatsApp number (digits only, with country code).
const WHATSAPP_NUMBER = "1234567890";
// TODO: replace with the actual GitHub profile or organization URL.
const GITHUB_URL = "https://github.com/";
const GMAIL_ICON = "https://simpleicons.org/icons/gmail.svg";
const WHATSAPP_ICON = "https://simpleicons.org/icons/whatsapp.svg";
const GITHUB_ICON = "https://simpleicons.org/icons/github.svg";

function GuestOnly({ children }) {
  const { isAuthenticated, userType, authenticating } = useAuth();
  if (authenticating) return children;
  if (isAuthenticated) {
    const to = userType === "admin" ? "/admin/dashboard" : userType === "teacher" ? "/teacher/dashboard" : "/home";
    return <Navigate to={to} replace />;
  }
  return children;
}

export default function App() {
  return (
    <Router>
      <ToastProvider>
        <ErrorBoundary>
          <AuthProvider>
            <Navbar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/teachers" element={<Teachers />} />
            <Route
              path="/teachers/:teacherId/subscribe"
              element={
                <ProtectedRoute allow={["student"]}>
                  <Subscribe />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/teacher/:teacherId"
              element={
                <ProtectedRoute allow={["student"]}>
                  <TeacherContent />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/teacher/:teacherId/lectures/:lectureId"
              element={
                <ProtectedRoute allow={["student"]}>
                  <LectureJourney />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/teacher/:teacherId/lectures/:lectureId/files"
              element={
                <ProtectedRoute allow={["student"]}>
                  <LectureJourney />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/teacher/:teacherId/lectures/:lectureId/video"
              element={
                <ProtectedRoute allow={["student"]}>
                  <LectureJourney />
                </ProtectedRoute>
              }
            />
            <Route
              path="/content/teacher/:teacherId/exams/:examId"
              element={
                <ProtectedRoute allow={["student"]}>
                  <ExamTake />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-subscriptions"
              element={
                <ProtectedRoute allow={["student"]}>
                  <MySubscriptions />
                </ProtectedRoute>
              }
            />
            <Route
              path="/my-lectures"
              element={
                <ProtectedRoute allow={["student"]}>
                  <MyLectures />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute allow={["student"]}>
                  <MyHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute allow={["student", "teacher", "admin"]}>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/dashboard"
              element={
                <ProtectedRoute allow={["teacher"]}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/subscribers"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminSubscribers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/teachers"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminTeachers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/teachers/:teacherId"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminTeacherDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/income"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminIncome />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <ProtectedRoute allow={["admin"]}>
                  <AdminLogs />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
        <footer className="footer">
          {/* <span>Education System — learn from expert teachers.</span> */}
          <span>This website was developed by Youssef Sabry</span>
          <span className="social-links">
            <a
              className="social-link"
              href={`https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(SUPPORT_EMAIL)}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Contact us at ${SUPPORT_EMAIL} via Gmail`}
              title="Contact us via Gmail"
            >
              <img src={GMAIL_ICON} alt="" width="18" height="18" loading="lazy" />
            </a>
            <a
              className="social-link"
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Chat with us on WhatsApp"
              title="Chat with us on WhatsApp"
            >
              <img src={WHATSAPP_ICON} alt="" width="18" height="18" loading="lazy" />
            </a>
            <a
              className="social-link"
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Find us on GitHub"
              title="Find us on GitHub"
            >
              <img className="social-icon-github" src={GITHUB_ICON} alt="" width="18" height="18" loading="lazy" />
            </a>
          </span>
        </footer>
          </AuthProvider>
        </ErrorBoundary>
      </ToastProvider>
    </Router>
  );
}
