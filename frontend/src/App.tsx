import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/lib/locale/zh_CN';
import AppLayout from './components/AppLayout';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import EmployeesPage from './pages/Employees';
import PayrollPage from './pages/PayrollRun';
import AttendancePage from './pages/Attendance';
import CompaniesPage from './pages/Companies';
import ReportsPage from './pages/Reports';
import SettingsPage from './pages/Settings';

// 简单的认证守卫
const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('supabase_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN} theme={{
      token: {
        colorPrimary: '#1677ff',
        borderRadius: 6,
      },
    }}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/*" element={
            <AuthGuard>
              <AppLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/employees" element={<EmployeesPage />} />
                  <Route path="/payroll" element={<PayrollPage />} />
                  <Route path="/attendance" element={<AttendancePage />} />
                  <Route path="/companies" element={<CompaniesPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
};

export default App;
