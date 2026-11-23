import { Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { RequireAuth, RequireRole } from './components/StateViews';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { DiagnosticsPage } from './pages/DiagnosticsPage';
import { EquipmentDetailPage } from './pages/EquipmentDetailPage';
import { FacultyDashboardPage } from './pages/FacultyDashboardPage';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { MarketplacePage } from './pages/MarketplacePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ReservationsPage } from './pages/ReservationsPage';
import { StudentRequestsPage } from './pages/StudentRequestsPage';

export function AppRoutes() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/diagnostics" element={<DiagnosticsPage />} />

        <Route
          path="/equipment"
          element={
            <RequireAuth>
              <MarketplacePage />
            </RequireAuth>
          }
        />
        <Route
          path="/equipment/:id"
          element={
            <RequireAuth>
              <EquipmentDetailPage />
            </RequireAuth>
          }
        />
        <Route
          path="/requests"
          element={
            <RequireAuth>
              <StudentRequestsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reservations"
          element={
            <RequireAuth>
              <ReservationsPage />
            </RequireAuth>
          }
        />

        <Route
          path="/faculty"
          element={
            <RequireRole roles={['Faculty', 'Admin']}>
              <FacultyDashboardPage />
            </RequireRole>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireRole roles={['Faculty', 'Admin']}>
              <AdminDashboardPage />
            </RequireRole>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
