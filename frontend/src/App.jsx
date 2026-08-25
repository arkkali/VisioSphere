import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AlertProvider } from './context/AlertContext';
import ProtectedRoute from './components/ProtectedRoute';
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

/**
 * Every route below the sign-in page is wrapped. This used to be open: any URL
 * typed straight into the address bar rendered its page with no session at all,
 * which is how /admin/monitoring opened the CCTV hub to anyone who guessed it.
 *
 * See components/ProtectedRoute.jsx for why this is exposure control rather
 * than a security boundary, and for the camera feed caveat.
 */
function App() {
  return (
    <ThemeProvider>
      <AlertProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Login />} />

            {/* Admin */}
            <Route path="/admin"             element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/nurses"      element={<ProtectedRoute><NursePage /></ProtectedRoute>} />
            <Route path="/admin/elders"      element={<ProtectedRoute><EldersDashboard /></ProtectedRoute>} />
            <Route path="/admin/guardians"   element={<ProtectedRoute><GuardianDashboard /></ProtectedRoute>} />
            <Route path="/admin/monitoring"  element={<ProtectedRoute><CCTVAnalytics /></ProtectedRoute>} />
            <Route path="/admin/assessments" element={<ProtectedRoute><DailyAssessments /></ProtectedRoute>} />
            <Route path="/admin/video-clips" element={<ProtectedRoute><VideoClips /></ProtectedRoute>} />
            <Route path="/admin/audit"       element={<ProtectedRoute><AuditTrail /></ProtectedRoute>} />
            <Route path="/admin/settings"    element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* Nurse */}
            <Route path="/nurse"             element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
            <Route path="/nurse/elders"      element={<ProtectedRoute><EldersDashboard /></ProtectedRoute>} />
            <Route path="/nurse/guardians"   element={<ProtectedRoute><GuardianDashboard /></ProtectedRoute>} />
            <Route path="/nurse/monitoring"  element={<ProtectedRoute><CCTVAnalytics /></ProtectedRoute>} />
            <Route path="/nurse/assessments" element={<ProtectedRoute><DailyAssessments /></ProtectedRoute>} />
            <Route path="/nurse/video-clips" element={<ProtectedRoute><VideoClips /></ProtectedRoute>} />
            <Route path="/nurse/settings"    element={<ProtectedRoute><Settings /></ProtectedRoute>} />

            {/* Unknown URLs must NOT leak whether a page exists, so 404 is
                gated too — otherwise /admin/anything renders a friendly page
                to a stranger while /admin/monitoring redirects, which by
                itself tells them which routes are real. */}
            <Route path="*" element={<ProtectedRoute><NotFoundPage /></ProtectedRoute>} />
          </Routes>
        </Router>
      </AlertProvider>
    </ThemeProvider>
  );
}

export default App;
