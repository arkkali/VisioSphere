import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AlertProvider } from './context/AlertContext';
import Login from './pages/Login';
import AdminDashboard from './pages/AdminDashboard';
import NursePage from './pages/NursePage';
import EldersDashboard from './pages/EldersDashboard';
import GuardianDashboard from './pages/GuardianDashboard';
import CCTVAnalytics from './pages/CCTVAnalytics';
import AuditTrail from './pages/AuditTrail';
import Settings from './pages/Settings';
import DailyAssessments from './pages/DailyAssessments';
import VideoClips from './pages/VideoClips';
import NotFoundPage from './pages/NotFoundPage';

function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/nurses" element={<NursePage />} />
            <Route path="/admin/elders" element={<EldersDashboard />} />
            <Route path="/admin/guardians" element={<GuardianDashboard />} />
            <Route path="/admin/monitoring" element={<CCTVAnalytics />} />
            <Route path="/admin/assessments" element={<DailyAssessments />} />
            <Route path="/admin/video-clips" element={<VideoClips />} />
            <Route path="/admin/audit" element={<AuditTrail />} />
            <Route path="/admin/settings" element={<Settings />} />
            <Route path="/nurse" element={<AdminDashboard />} />
            <Route path="/nurse/elders" element={<EldersDashboard />} />
            <Route path="/nurse/guardians" element={<GuardianDashboard />} />
            <Route path="/nurse/monitoring" element={<CCTVAnalytics />} />
            <Route path="/nurse/assessments" element={<DailyAssessments />} />
            <Route path="/nurse/video-clips" element={<VideoClips />} />
            <Route path="/nurse/settings" element={<Settings />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Router>
      </AlertProvider>
    </ThemeProvider>
  );
}

export default App;