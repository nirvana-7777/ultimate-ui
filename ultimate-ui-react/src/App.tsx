import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { EPGPage } from './pages/EPGPage';
import { ConfigPage } from './pages/ConfigPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { MonitoringPage } from './pages/MonitoringPage';
import { MappingPage } from './pages/MappingPage';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './lib/toast';

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<EPGPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/monitoring" element={<MonitoringPage />} />
            <Route path="/mapping" element={<MappingPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </ThemeProvider>
  );
}
