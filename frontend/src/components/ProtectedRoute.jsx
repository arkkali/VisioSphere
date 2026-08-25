// frontend/src/components/ProtectedRoute.jsx
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Gate for every route that is not the sign-in page.
 *
 * WHAT THIS FIXES
 *
 * Every route in App.jsx rendered unconditionally, so typing
 * /admin/monitoring straight into the address bar opened the CCTV hub with no
 * sign-in at all. Same for every other tab.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is a UX and exposure control, NOT a security boundary. Anything running
 * in the browser can be edited by whoever is holding the browser, so a
 * determined visitor can always render the shell. Real enforcement is server
 * side: every /api route sits behind verifyToken, and axiosInstance sends the
 * user back here on a 401. What this stops is the accidental and the casual —
 * a shared link, a bookmarked deep link, a guessed URL — which is exactly how
 * /admin/monitoring was being reached.
 *
 * IMPORTANT: a route guard does NOT protect the camera feed itself. The MJPEG
 * stream is served by ai_core, not by this app, and is reachable directly by
 * URL. See constants/cameras.js.
 *
 * SCOPE: this checks that someone is SIGNED IN, and nothing more. It
 * deliberately does not restrict which role may open which route — a signed-in
 * nurse can still reach /admin/*. That is a conscious choice, not an oversight:
 * the backend already enforces role separately (authorizeRoles on the routes
 * that matter), so the exposure is a rendered page, not the data behind it.
 */
const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');

  // Not signed in. `state.from` records where they were headed; Login does not
  // consume it yet, so today this is plain information for a later
  // return-to-intended-page. It costs nothing and avoids losing the intent.
  if (!token) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
