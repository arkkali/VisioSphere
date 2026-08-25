import { useEffect, useRef, useState } from 'react';
import axiosInstance from '../api/axiosInstance';

/**
 * A short-lived, signed viewing token for the MJPEG feeds.
 *
 * WHY THIS EXISTS
 *
 * The feeds used to be authorised with VITE_STREAM_TOKEN, a single static
 * secret. Vite inlines every VITE_* variable into the built bundle, so that
 * secret shipped to every visitor — anyone could read it out of the JavaScript
 * and stream a camera directly from ai_core, with no sign-in and without ever
 * loading this app. A route guard cannot fix that, because the request never
 * touches this app.
 *
 * GET /api/stream/token sits behind verifyToken and returns a token that is
 * signed, per-session and expiring. ai_core verifies it against
 * STREAM_SIGNING_SECRET with no database round-trip. The mobile app has always
 * used this; the web is catching up.
 *
 * Returns null until a token has been obtained, which is the correct default:
 * no token means no feed URL, so the tiles show "No Signal" rather than
 * attempting an unauthenticated request.
 */
export const useStreamToken = () => {
  const [stream, setStream] = useState(null); // { token, streamBase }
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const fetchToken = async () => {
      try {
        const { data } = await axiosInstance.get('/stream/token');
        if (cancelledRef.current || !data?.token) return;

        setStream({
          token: data.token,
          // The backend names the public tunnel URL; fall back to the build-time
          // value so a backend without STREAM_PUBLIC_URL set still works.
          streamBase: (data.streamBase || import.meta.env.VITE_STREAM_URL || '')
            .replace(/\/$/, ''),
        });

        // Re-mint ~30s before expiry so an open feed never drops on a stale
        // token. Clamped so a nonsense expiresIn cannot spin this into a
        // request loop or park it for a day.
        const lead = Math.min(Math.max((data.expiresIn ?? 300) - 30, 15), 86400);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(fetchToken, lead * 1000);
      } catch (err) {
        // A 401 is already handled globally by axiosInstance (it signs the user
        // out), so there is nothing to do here but leave the feeds dark.
        console.warn('[useStreamToken] could not obtain a stream token:', err?.message);
      }
    };

    fetchToken();

    return () => {
      cancelledRef.current = true;
      clearTimeout(timerRef.current);
    };
  }, []);

  return stream;
};

export default useStreamToken;
