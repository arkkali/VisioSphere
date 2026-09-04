import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AlertProvider } from './context/AlertContext';
import ProtectedRoute from './components/ProtectedRoute';

// Login is imported eagerly on purpose: it is the first paint for every visitor
// and lazy-loading it would only add a round trip to the one page that must be
// fast.
import Login from './pages/Login';

/**
 * EVERY OTHER PAGE IS SPLIT OUT.
 *
 * These were all plain imports, so Vite emitted one 2.4 MB entry chunk and the
 * sign-in page downloaded, parsed and executed the entire admin application —
 * Recharts, jsPDF, the CCTV socket client, Framer Motion — before anyone could
 * type a password. Lighthouse reported it as 516 KiB of unused JavaScript and
 * four long main-thread tasks.
 *
 * React.lazy gives each page its own chunk, fetched the first time its route is
 * visited. Nothing about the routing table below changes; only when the code
 * arrives does.
 */
const AdminDashboard    = lazy(() => import('./pages/AdminDashboard'));
const NursePage         = lazy(() => import('./pages/NursePage'));
const EldersDashboard   = lazy(() => import('./pages/EldersDashboard'));
const GuardianDashboard = lazy(() => import('./pages/GuardianDashboard'));
const CCTVAnalytics     = lazy(() => import('./pages/CCTVAnalytics'));
const AuditTrail        = lazy(() => import('./pages/AuditTrail'));
const Settings          = lazy(() => import('./pages/Settings'));
const DailyAssessments  = lazy(() => import('./pages/DailyAssessments'));
const VideoClips        = lazy(() => import('./pages/VideoClips'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage'));

/**
 * Shown only while a route's chunk is in flight — never on the sign-in page,
 * which is not lazy. Deliberately plain: a heavy skeleton here would be one
 * more thing to download before the thing you actually asked for.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] dark:bg-slate-900">
      <div
        role="status"
        aria-label="Loading"
        className="w-10 h-10 rounded-full border-[3px] border-[#e2e8f0] dark:border-slate-700 border-t-[#00a8e8] animate-spin"
      />
    </div>
  );
}

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
          <Suspense fallback={<RouteFallback />}>
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
          </Suspense>
        </Router>
      </AlertProvider>
    </ThemeProvider>
  );
}

export default App;
