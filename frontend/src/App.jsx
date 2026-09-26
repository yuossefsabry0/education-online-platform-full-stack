import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext.jsx";
import Navbar from "./components/Navbar.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminIncome from "./pages/AdminIncome.jsx";
import AdminLogs from "./pages/AdminLogs.jsx";
import AdminSubscribers from "./pages/AdminSubscribers.jsx";
import AdminTeacherDetail from "./pages/AdminTeacherDetail.jsx";
import AdminTeachers from "./pages/AdminTeachers.jsx";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import Subscribe from "./pages/Subscribe.jsx";
import TeacherContent from "./pages/TeacherContent.jsx";
import TeacherDashboard from "./pages/TeacherDashboard.jsx";
import Teachers from "./pages/Teachers.jsx";

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Navbar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
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
          <span>Education System — learn from expert teachers.</span>
        </footer>
      </AuthProvider>
    </Router>
  );
}
