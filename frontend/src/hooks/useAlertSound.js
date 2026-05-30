import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useAlertSound
 * ─────────────────────────────────────────────────────────────────────────────
 * Plays an alert sound when called and exposes:
 *   • isPlaying — true while audio is playing (UI uses this to turn the
 *     speaker icon green and pulse it).
 *   • audioUnlocked — true once the browser's autoplay policy has been
 *     satisfied. Surfaced so a "Click to enable sound" hint can be shown
 *     while it's false.
 *   • volume / setVolume — current volume (0.0–1.0) and a setter that
 *     persists to localStorage and applies live to in-flight audio.
 *   • playAlertSound(severity) — start playing the appropriate sound.
 *
 * Routing:
 *   • Emergency (Fall, Inactivity, Inactivity (Posture), Prolonged Fall)
 *       → /sounds/emergency.mp3
 *   • Warning (Agitation, Pacing, Lying Down, others)
 *       → /sounds/warning.mp3
 *
 * Both sounds are capped at PLAY_DURATION_MS (5 seconds).
 *
 * AUTOPLAY UNLOCK:
 *   Modern browsers block any audio.play() that's not the direct result of a
 *   user gesture. Hard refreshes and new browser sessions reset this state,
 *   so a tab that worked yesterday may fail today. We deal with this by:
 *     1. Pre-creating PERSISTENT Audio elements on mount (one per severity)
 *        rather than `new Audio()` per alert. Persistent elements that have
 *        been "primed" once stay unlocked for the rest of the session.
 *     2. Listening for the FIRST user gesture anywhere on the page
 *        (pointerdown / keydown / touchstart). On that event we call
 *        play()+immediately pause() on each audio element to satisfy the
 *        browser's user-activation requirement, then mark them unlocked.
 *     3. After the unlock, every subsequent playAlertSound() call uses the
 *        already-unlocked elements and plays without delay.
 *
 *   Net effect: the user must click (or tap or press a key) at least once
 *   on the dashboard before the first alert sound can play. Every alert
 *   after that plays immediately. This is a browser policy we cannot bypass.
 *
 * UNINTERRUPTIBLE PLAYBACK:
 *   Once a sound starts, it runs to its natural end OR the 5-second cap,
 *   whichever comes first. New alerts arriving DURING playback are silently
 *   dropped — they don't stop the current audio and don't start a new one.
 *   The visual notification (bell badge, dropdown card) still appears for
 *   every alert; only the audio is rate-limited to "one at a time."
 */
const PLAY_DURATION_MS = 5000;   // hard cap — both severities cut at 5 s
const STORAGE_KEY      = 'alertVolume';
const DEFAULT_VOLUME   = 1.0;    // 100% by default
const EMERGENCY_SRC    = '/sounds/emergency.mp3';
const WARNING_SRC      = '/sounds/warning.mp3';

const clampVolume = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (Number.isNaN(n)) return DEFAULT_VOLUME;
  return Math.max(0, Math.min(1, n));
};

export function useAlertSound() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Volume state — hydrated from localStorage so the user's preference
  // survives page refresh and applies across sessions.
  const [volume, setVolumeState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? clampVolume(saved) : DEFAULT_VOLUME;
  });

  // Persistent Audio elements — created once on mount, reused for every
  // alert. Stored in refs so React re-renders don't re-create them.
  const emergencyAudioRef = useRef(null);
  const warningAudioRef   = useRef(null);

  // Currently-playing audio element (the playback lock — see header comment).
  const activeAudioRef = useRef(null);
  const cutoffTimerRef = useRef(null);

  // Mirror volume into a ref so playAlertSound reads the LIVE value rather
  // than a stale closure.
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);

  // ── Mount: create persistent Audio elements ──────────────────────────────
  useEffect(() => {
    const emergency = new Audio(EMERGENCY_SRC);
    const warning   = new Audio(WARNING_SRC);
    emergency.preload = 'auto';
    warning.preload   = 'auto';
    emergency.volume  = volumeRef.current;
    warning.volume    = volumeRef.current;
    emergencyAudioRef.current = emergency;
    warningAudioRef.current   = warning;

    return () => {
      // Cleanup on unmount — stop any in-flight audio and clear the timer
      // so a navigating-away user doesn't leave a ghost alarm playing.
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current.currentTime = 0;
        activeAudioRef.current = null;
      }
      if (cutoffTimerRef.current) {
        clearTimeout(cutoffTimerRef.current);
        cutoffTimerRef.current = null;
      }
      emergencyAudioRef.current = null;
      warningAudioRef.current = null;
    };
  }, []);

  // ── Push live volume changes into the persistent audio elements ──────────
  useEffect(() => {
    if (emergencyAudioRef.current) emergencyAudioRef.current.volume = volume;
    if (warningAudioRef.current)   warningAudioRef.current.volume   = volume;
  }, [volume]);

  // ── First user gesture: prime both audio elements ────────────────────────
  // We need to call play() inside the user-gesture handler, then pause()
  // immediately. After this completes successfully, both elements stay
  // unlocked for the rest of the session.
  useEffect(() => {
    if (audioUnlocked) return;

    const unlock = () => {
      const emergency = emergencyAudioRef.current;
      const warning   = warningAudioRef.current;
      if (!emergency || !warning) return;

      // Mute during priming so the user doesn't hear a glitch on first click.
      const prevEmergencyMuted = emergency.muted;
      const prevWarningMuted   = warning.muted;
      emergency.muted = true;
      warning.muted   = true;

      Promise.all([
        emergency.play().then(() => {
          emergency.pause();
          emergency.currentTime = 0;
        }).catch(() => { /* leave locked; user will retry on next gesture */ }),
        warning.play().then(() => {
          warning.pause();
          warning.currentTime = 0;
        }).catch(() => { /* same */ }),
      ]).finally(() => {
        emergency.muted = prevEmergencyMuted;
        warning.muted   = prevWarningMuted;
        setAudioUnlocked(true);
      });
    };

    const events = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((e) =>
      document.addEventListener(e, unlock, { once: true, capture: true })
    );

    return () => {
      events.forEach((e) =>
        document.removeEventListener(e, unlock, { capture: true })
      );
    };
  }, [audioUnlocked]);

  /** Public volume setter. Clamps and persists. */
  const setVolume = useCallback((v) => {
    const clamped = clampVolume(v);
    setVolumeState(clamped);
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }, []);

  /**
   * Play an alert sound based on severity. Pass 'Emergency' or 'Warning'.
   *
   * GUARDED: if a previous alert is still playing or within its 5-second
   * window, this call is a no-op. The current sound completes its full
   * window before any new sound can begin.
   */
  const playAlertSound = useCallback((severity) => {
    if (activeAudioRef.current) {
      // A sound is already playing — don't interrupt it.
      // Visual notification (bell, dropdown) still happens upstream.
      return;
    }

    const audio = severity === 'Emergency'
      ? emergencyAudioRef.current
      : warningAudioRef.current;

    if (!audio) return;  // hook unmounted before this fired

    audio.volume = volumeRef.current;
    audio.currentTime = 0;
    activeAudioRef.current = audio;

    audio.play()
      .then(() => {
        if (activeAudioRef.current === audio) setIsPlaying(true);
      })
      .catch((err) => {
        // Most common cause: page hasn't received any user gesture yet, so
        // the unlock effect above hasn't run. Tell the user via console; the
        // visual notification (bell badge, toast) still appears regardless.
        console.warn('[Sound] play() rejected:', err.name, err.message,
          '— click anywhere on the dashboard once to enable alert sounds.');
        if (activeAudioRef.current === audio) {
          activeAudioRef.current = null;
          setIsPlaying(false);
          if (cutoffTimerRef.current) {
            clearTimeout(cutoffTimerRef.current);
            cutoffTimerRef.current = null;
          }
        }
      });

    // Natural-end handler — fires when audio finishes playing on its own.
    // Common for warning.mp3, which is shorter than the 5-second cap.
    // Defined as a one-shot listener so we don't accumulate handlers across
    // reuses of the same persistent audio element.
    const onEnded = () => {
      if (activeAudioRef.current === audio) {
        activeAudioRef.current = null;
        setIsPlaying(false);
        if (cutoffTimerRef.current) {
          clearTimeout(cutoffTimerRef.current);
          cutoffTimerRef.current = null;
        }
      }
      audio.removeEventListener('ended', onEnded);
    };
    audio.addEventListener('ended', onEnded);

    // 5-second hard cap. Stops the audio if it hasn't ended naturally and
    // releases the lock so the next alert can play.
    cutoffTimerRef.current = setTimeout(() => {
      if (activeAudioRef.current === audio) {
        audio.pause();
        audio.currentTime = 0;
        activeAudioRef.current = null;
        setIsPlaying(false);
      }
      cutoffTimerRef.current = null;
    }, PLAY_DURATION_MS);
  }, []);

  return { isPlaying, audioUnlocked, volume, setVolume, playAlertSound };
}
