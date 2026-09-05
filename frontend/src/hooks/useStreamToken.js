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
 * WHERE A STILL-VALID TOKEN IS KEPT BETWEEN PAGE LOADS.
 *
 * WHY THIS IS SAFE TO CACHE
 *
 * signStreamToken() takes no arguments and binds nothing: the token is
 * `v1.<exp>.<hmac("v1.<exp>", STREAM_SIGNING_SECRET)>`. It carries no user, no
 * session and no facility — two people signing in a second apart get the same
 * string. It is a 10-minute bearer capability for "open a feed", and it is
 * ALREADY in the page in plain sight: it sits in the `src` of every camera
 * <img>, in the DOM, and in the network log. Parking it in localStorage until
 * its own `exp` therefore exposes nothing that was not already exposed.
 *
 * clearSession() does localStorage.clear() and restores only PRESERVED_KEYS, so
 * signing out drops this with everything else. That is deliberate and must stay
 * that way: do NOT add this key to PRESERVED_KEYS.
 *
 * WHY IT EXISTS
 *
 * Lighthouse put Largest Contentful Paint on this page at 3,960 ms and charged
 * 3,050 ms of it to "Load Delay" — the browser had not yet ASKED for the camera
 * image. Once asked, the first frame arrived in 620 ms. The queue in front of
 * the request was the request itself: nothing could set <img src> until a
 * cross-continent round trip to the backend on Render had returned a token.
 *
 * A token already in hand and not yet expired removes that round trip
 * completely — the first render of the page has a playable URL.
 */
const CACHE_KEY = 'vs_streamToken';

/** Discard a cached token this many seconds before it actually expires. */
const CACHE_SAFETY_S = 30;

const readCachedToken = () => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached?.token || typeof cached.exp !== 'number') return null;
    // Expired, or close enough to expiry that ai_core could reject it between
    // here and the connection. Treat as absent and mint a fresh one.
    if (cached.exp - CACHE_SAFETY_S <= Math.floor(Date.now() / 1000)) return null;
    return { token: cached.token, streamBase: cached.streamBase || '', exp: cached.exp };
  } catch {
    // Unreadable or malformed storage: behave exactly as if nothing was cached.
    return null;
  }
};

const writeCachedToken = (data, streamBase) => {
  try {
    // `exp` is absolute unix-seconds from the backend. Fall back to expiresIn
    // when an older backend does not send it.
    const exp = typeof data.exp === 'number'
      ? data.exp
      : Math.floor(Date.now() / 1000) + (data.expiresIn ?? 300);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ token: data.token, exp, streamBase }));
  } catch {
    // Storage full or unavailable — the feed still works, it just pays the
    // round trip again on the next load.
  }
};

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
  // A cached token that is still good needs no request at all; useStreamToken
  // picks it up synchronously as its initial state.
  if (readCachedToken()) return null;

  primed = axiosInstance
    .get('/stream/token')
    .then(({ data }) => data)
    .catch(() => null); // a real failure is retried by the hook below
  return primed;
};

export const useStreamToken = () => {
  // Seeded from the cache, NOT null: a valid cached token means the camera
  // <img> has a src on the very first render, with no network in between.
  const [stream, setStream] = useState(readCachedToken); // { token, streamBase }
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

        // The backend names the public tunnel URL; fall back to the build-time
        // value so a backend without STREAM_PUBLIC_URL set still works.
        const streamBase = (data.streamBase || import.meta.env.VITE_STREAM_URL || '')
          .replace(/\/$/, '');

        setStream({ token: data.token, streamBase });
        writeCachedToken(data, streamBase);

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

    // A cached token that is still valid is already in state and already
    // driving the <img> src. Re-minting now would hand every camera a NEW url,
    // and CameraFeed keys its <img> on the url — so the browser would tear down
    // and reopen every MJPEG connection a moment after the page settled, for a
    // token that had minutes left. Schedule the refresh against the cached
    // expiry instead and leave the open streams alone.
    const cached = readCachedToken();
    if (cached) {
      const lead = Math.min(
        Math.max(cached.exp - CACHE_SAFETY_S - Math.floor(Date.now() / 1000), 15),
        86400,
      );
      timerRef.current = setTimeout(fetchToken, lead * 1000);
      // The boot-time prime is skipped when a cached token exists, so there is
      // no in-flight request to drain here.
    } else {
      fetchToken(true);
    }

    return () => {
      cancelledRef.current = true;
      clearTimeout(timerRef.current);
    };
  }, []);

  return stream;
};

export default useStreamToken;
