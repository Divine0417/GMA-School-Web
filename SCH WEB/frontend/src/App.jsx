import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import './styles/global.css';
import './styles/portal.css';

// Contexts
import { AuthProvider } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';

// Components
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';
import PortalLayout from './components/PortalLayout';

// Public Pages
import Home from './pages/Home';
import About from './pages/About';
import Admissions from './pages/Admissions';
import Academics from './pages/Academics';
import Careers from './pages/Careers';
import Contact from './pages/Contact';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Sitemap from './pages/Sitemap';
import NotFound from './pages/NotFound';

// Auth Pages
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Portal Pages
import Dashboard from './pages/portal/Dashboard';
import Profile from './pages/portal/Profile';
import ReportCards from './pages/portal/ReportCards';
import Bills from './pages/portal/Bills';
import Notices from './pages/portal/Notices';
import Resources from './pages/portal/Resources';
import Exams from './pages/portal/Exams';
import ExamResult from './pages/portal/ExamResult';
import ExamTake from './pages/portal/ExamTake';

// Layout component for public pages
const PublicLayout = ({ children }) => (
  <>
    <Header />
    <main>{children}</main>
    <Footer />
  </>
);

function App() {
  return (
    <HelmetProvider>
      <AuthProvider>
        <DialogProvider>
          <Router>
            <div className="App">
              <Routes>
              {/* Public Routes with Header/Footer */}
              <Route path="/" element={<PublicLayout><Home /></PublicLayout>} />
              <Route path="/about" element={<PublicLayout><About /></PublicLayout>} />
              <Route path="/admissions" element={<PublicLayout><Admissions /></PublicLayout>} />
              <Route path="/academics" element={<PublicLayout><Academics /></PublicLayout>} />
              <Route path="/careers" element={<PublicLayout><Careers /></PublicLayout>} />
              <Route path="/contact" element={<PublicLayout><Contact /></PublicLayout>} />
              <Route path="/privacy" element={<PublicLayout><Privacy /></PublicLayout>} />
              <Route path="/terms" element={<PublicLayout><Terms /></PublicLayout>} />
              <Route path="/sitemap" element={<PublicLayout><Sitemap /></PublicLayout>} />

              {/* Authentication Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password/:token" element={<ResetPassword />} />

              {/* Protected Portal Routes */}
              <Route path="/portal" element={
                <ProtectedRoute allowedRoles={['student', 'parent', 'staff', 'admin']}>
                  <PortalLayout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="profile" element={<Profile />} />
                <Route path="report-cards" element={<ReportCards />} />
                <Route path="bills" element={<Bills />} />
                <Route path="notices" element={<Notices />} />
                <Route path="resources" element={<Resources />} />
                <Route path="exams" element={<Exams />} />
                <Route path="exams/:examId/result" element={<ExamResult />} />
              </Route>

              {/* CBT exam-taking view — deliberately outside PortalLayout (no
                  sidebar/header chrome) since it needs to run fullscreen with
                  minimal distraction, and only the student themself may sit it. */}
              <Route path="/exam/:examId" element={
                <ProtectedRoute allowedRoles={['student']}>
                  <ExamTake />
                </ProtectedRoute>
              } />

              {/* Admin Routes */}
              <Route path="/admin" element={
                <ProtectedRoute allowedRoles={['admin', 'staff']}>
                  <div>Admin Panel - Coming Soon</div>
                </ProtectedRoute>
              } />

              {/* 404 Page */}
              <Route path="*" element={<PublicLayout><NotFound /></PublicLayout>} />
            </Routes>
            </div>
          </Router>
        </DialogProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}

export default App;