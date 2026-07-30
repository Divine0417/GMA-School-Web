import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { DialogProvider } from './contexts/DialogContext';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Applications from './pages/Applications';
import CareerApplications from './pages/CareerApplications';
import Messages from './pages/Messages';
import Students from './pages/Students';
import Staff from './pages/Staff';
import Notices from './pages/Notices';
import Resources from './pages/Resources';
import Exams from './pages/Exams';
import Settings from './pages/Settings';
import Billing from './pages/Billing';
import ReportCards from './pages/ReportCards';

function App() {
  return (
    <AuthProvider>
      <DialogProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="applications" element={<Applications />} />
              <Route path="career-applications" element={<CareerApplications />} />
              <Route path="messages" element={<Messages />} />
              <Route path="students" element={<Students />} />
              <Route
                path="staff"
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <Staff />
                  </ProtectedRoute>
                }
              />
              <Route path="notices" element={<Notices />} />
              <Route path="resources" element={<Resources />} />
              <Route path="exams" element={<Exams />} />
              <Route path="billing" element={<Billing />} />
              <Route path="report-cards" element={<ReportCards />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Router>
      </DialogProvider>
    </AuthProvider>
  );
}

export default App;
