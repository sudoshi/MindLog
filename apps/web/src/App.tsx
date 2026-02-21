import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { MfaPage } from './pages/MfaPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { AlertsPage } from './pages/AlertsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { AuthGuard } from './components/AuthGuard.js';

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />

      {/* Protected — requires authenticated clinician session */}
      <Route element={<AuthGuard />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/patients/:patientId" element={<PatientDetailPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
