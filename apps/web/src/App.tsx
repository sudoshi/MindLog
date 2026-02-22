import { Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage.js';
import { MfaPage } from './pages/MfaPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { PatientsPage } from './pages/PatientsPage.js';
import { PatientDetailPage } from './pages/PatientDetailPage.js';
import { AlertsPage } from './pages/AlertsPage.js';
import { TrendsPage } from './pages/TrendsPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';

export function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/mfa" element={<MfaPage />} />

      {/* Protected — requires authenticated clinician session */}
      <Route element={<AuthGuard />}>
        {/* AppShell provides sidebar + topbar for all protected pages */}
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/patients" element={<PatientsPage />} />
          <Route path="/patients/:patientId" element={<PatientDetailPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
