import { useEffect, useRef, useState } from 'react';
import { AI_CORE_STATUS_URL } from '../constants/cameras';

/**
 * Live camera liveness, polled from ai_core's /status.
 *
 * ai_core records a capture timestamp with every frame; /status turns that into
 * `online` per camera — "produced a frame in the last few seconds", not merely
 * "is configured". That distinction is the whole point: before this, the
 * dashboard showed 2/4 Active because the array said so, even with nothing
 * plugged in.
 *
 * FAILS CLOSED. If ai_core is unreachable, or the response is malformed, every
 * camera reports offline. Over-reporting would tell staff a camera is watching
 * a resident when it isn't — the more dangerous direction to be wrong in.
 *
 * @param {number} intervalMs how often to re-poll (default 5s, matching
 *   ai_core's default CAMERA_STALE_AFTER_S so the UI can't lag reality by much)
 */
export const useCameraHealth = (intervalMs = 5000) => {
  const [state, setState] = useState({ online: {}, ages: {}, reachable: null, checkedAt: null });
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      // Don't let a hung tunnel wedge the poller — bail well inside the interval.
      const timer = setTimeout(() => controller.abort(), Math.max(2000, intervalMs - 500));

      try {
        const res = await fetch(AI_CORE_STATUS_URL, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = await res.json();

        const online = {};
        const ages = {};
        if (Array.isArray(data.cameraHealth)) {
          data.cameraHealth.forEach((c) => {
            online[c.id] = !!c.online;
            ages[c.id] = c.lastFrameAgo ?? null;
          });
        }
        if (!cancelled) setState({ online, ages, reachable: true, checkedAt: Date.now() });
      } catch {
        // Includes the abort we trigger on unmount; harmless either way.
        if (!cancelled) setState({ online: {}, ages: {}, reachable: false, checkedAt: Date.now() });
      } finally {
        clearTimeout(timer);
      }
    };

    poll();
    const id = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [intervalMs]);

  return {
    /** Is this ai_core camera id currently producing frames? */
    get: (feedId) => !!state.online[feedId],
    /** Seconds since its last frame, or null if never/unknown. */
    getAge: (feedId) => state.ages[feedId] ?? null,
    /** false when ai_core itself could not be reached (everything reads offline). */
    reachable: state.reachable,
    checkedAt: state.checkedAt,
  };
};

export default useCameraHealth;
