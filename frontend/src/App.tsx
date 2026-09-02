import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Overview from './pages/Overview';
import DataUpload from './pages/DataUpload';
import DataSelection from './pages/DataSelection';
import Observations from './pages/Observations';
import Predictions from './pages/Predictions';
import Users from './pages/Users';
import DataManagement from './pages/DataManagement';
import Admins from './pages/Admins';
import Zones from './pages/Zones';
import AuditLogs from './pages/AuditLogs';
import Profile from './pages/Profile';
import MonthlyReports from './pages/MonthlyReports';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Overview />} />
            <Route path="upload" element={<DataUpload />} />
            <Route path="selection" element={<DataSelection />} />
            <Route path="observations" element={<Observations />} />
            <Route path="predictions" element={<Predictions />} />
            <Route path="users" element={<Users />} />
            <Route path="data-management" element={<DataManagement />} />
            <Route path="admins" element={<Admins />} />
            <Route path="zones" element={<Zones />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="profile" element={<Profile />} />
            <Route path="monthly-reports" element={<MonthlyReports />} />
          </Route>
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
