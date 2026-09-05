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
/**
 * The in-flight (or completed) result of a token request started at boot.
 * One-shot: the first hook instance consumes it, everything after mints
 * normally.
 */
let primed = null;

/**
 * Start minting the stream token BEFORE React has mounted anything.
 *
 * WHY
 *
 * Lighthouse measured Largest Contentful Paint on the monitoring hub at
 * 3,730 ms and attributed 75% of it — 2,790 ms — to "Load Delay": the gap
 * before the browser even begins requesting the camera image. Once requested,
 * the first frame lands in 640 ms. The camera is not slow; the queue in front
 * of it is.
 *
 * That queue was: entry chunk, then the route's chunk, then React mounts, then
 * this request, and only then does <img src> exist. The request needs nothing
 * from React — just the auth token already sitting in localStorage — so it can
 * run alongside the chunk download instead of behind it.
 *
 * Deliberately scoped to the monitoring routes. Every other page would gain an
 * API call it has no use for.
 */
export const primeStreamToken = () => {
  if (primed) return primed;
  if (typeof window === 'undefined') return null;
  if (!/\/(admin|nurse)\/monitoring\/?$/.test(window.location.pathname)) return null;
  if (!localStorage.getItem('token')) return null;

  primed = axiosInstance
    .get('/stream/token')
    .then(({ data }) => data)
    .catch(() => null); // a real failure is retried by the hook below
  return primed;
};

export const useStreamToken = () => {
  const [stream, setStream] = useState(null); // { token, streamBase }
  const timerRef = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    const fetchToken = async (allowPrimed = false) => {
      try {
        // Reuse the request started at boot if there is one; it is a one-shot,
        // so refreshes below always mint fresh.
        let data = null;
        if (allowPrimed && primed) {
          data = await primed;
          primed = null;
        }
        if (!data) ({ data } = await axiosInstance.get('/stream/token'));

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

    fetchToken(true);

    return () => {
      cancelledRef.current = true;
      clearTimeout(timerRef.current);
    };
  }, []);

  return stream;
};

export default useStreamToken;
