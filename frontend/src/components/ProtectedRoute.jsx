// frontend/src/components/ProtectedRoute.jsx
import { useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/**
 * Gate for every route that is not the sign-in page.
 *
 * WHAT THIS FIXES
 *
 * Every route in App.jsx used to render unconditionally, so typing
 * /admin/monitoring straight into the address bar opened the CCTV hub with no
 * sign-in at all.
 *
 * WHAT THIS IS AND IS NOT
 *
 * This is a UX and exposure control, NOT a security boundary. Anything running
 * in the browser can be edited by whoever is holding the browser, so a
 * determined visitor can always render the shell. Real enforcement is server
 * side: every /api route sits behind verifyToken, and axiosInstance sends the
 * user back here on a 401. What this stops is the accidental and the casual —
 * a shared link, a bookmarked deep link, a guessed URL.
 *
 * IMPORTANT: a route guard does NOT protect the camera feed itself. The MJPEG
 * stream is served by ai_core, not by this app, and is reachable directly by
 * URL. See constants/cameras.js.
 *
 * SCOPE: this checks that someone is SIGNED IN, and nothing more. It
 * deliberately does not restrict which role may open which route — a signed-in
 * nurse can still reach /admin/*. The backend enforces role separately
 * (authorizeRoles), so the exposure is a rendered page, not the data behind it.
 *
 * WHY THE EXPIRY AND IDLE CHECKS BELOW EXIST
 *
 * Checking that a token is merely PRESENT is not the same as checking that
 * someone is signed in. localStorage survives closing the tab, closing the
 * browser and rebooting the machine, so once anyone signs in on a device, that
 * device walks straight into the admin dashboard forever — no password, no
 * expiry, nothing. On a shared nurses' station, or a laptop that leaves the
 * building, that is the whole login screen defeated.
 *
 * Two additions close it:
 *
 *   1. EXPIRY. The JWT carries its own `exp`. An expired token is treated as
 *      no token at all, rather than rendering the shell and waiting for the
 *      first API call to 401. Read-only: signature verification is the
 *      server's job and cannot be done here.
 *
 *   2. IDLE TIMEOUT. A session with nobody at the keyboard for IDLE_LIMIT_MS
 *      is ended. This is standard for anything showing patient data, and it is
 *      the part that protects an unattended workstation.
 */

// 30 minutes. Long enough not to interrupt a nurse mid-shift, short enough
// that a machine left unattended does not stay open all night.
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_KEY = 'lastActivityAt';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'];

/** Seconds-since-epoch expiry from a JWT, or null if it cannot be read. */
const tokenExpiry = (token) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    // Malformed token — treat as unreadable rather than as valid.
    return null;
  }
};

const isExpired = (token) => {
  const exp = tokenExpiry(token);
  // A token with no readable exp is left alone: the server is the authority on
  // validity, and refusing to render on a parse failure would lock out a valid
  // session over a formatting quirk.
  if (exp === null) return false;
  return Date.now() >= exp * 1000;
};

const idleTooLong = () => {
  const last = Number(localStorage.getItem(IDLE_KEY));
  if (!last) return false;        // never stamped — treat this render as fresh
  return Date.now() - last > IDLE_LIMIT_MS;
};

const endSession = () => {
  localStorage.clear();
};

const ProtectedRoute = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('token');

  const expired = !token || isExpired(token) || idleTooLong();
  if (expired && token) endSession();

  // Stamp activity and keep a timer running while a protected page is open, so
  // an unattended tab signs itself out instead of sitting on resident data.
  const timerRef = useRef(null);
  useEffect(() => {
    if (expired) return undefined;

    const stamp = () => {
      localStorage.setItem(IDLE_KEY, String(Date.now()));
    };
    stamp();

    const check = () => {
      if (idleTooLong()) {
        endSession();
        window.location.href = '/';
      }
    };
    timerRef.current = window.setInterval(check, 60 * 1000);
    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, stamp, { passive: true }));

    return () => {
      window.clearInterval(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, stamp));
    };
  }, [expired, location.pathname]);

  if (expired) {
    // `state.from` records where they were headed, for a later
    // return-to-intended-page. It costs nothing and keeps the intent.
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  return children;
};

export default ProtectedRoute;
