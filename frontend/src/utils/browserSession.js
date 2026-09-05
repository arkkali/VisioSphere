/**
 * browserSession.js — a web session lasts as long as the BROWSER does.
 *
 * THE POLICY
 *
 * Stay signed in for as long as this machine keeps running, and sign in again
 * after it has been shut down and started back up. No countdown, no timer the
 * user cannot see, no being thrown out mid-shift.
 *
 * WHAT THIS REPLACED
 *
 * ProtectedRoute used to end a session after 30 minutes with no qualifying
 * input event. That was wrong twice over. The event list left out `mousemove`
 * and `click`, and `scroll` was bound to `window` while this layout scrolls
 * inside `overflow-y-auto` panels — so someone watching the CCTV wall for half
 * an hour generated no "activity" at all and was signed out while actively
 * using the app. The backend was never the cause: config/session.js issues 7-day
 * tokens and slides them forward on every request.
 *
 * WHY A HEARTBEAT RATHER THAN sessionStorage
 *
 * The obvious implementation is to keep the token in sessionStorage, which the
 * browser discards on its own when it closes. It discards it PER TAB, though,
 * so a second dashboard on the second monitor opens to the sign-in screen while
 * the first one is signed in. These run on nurses' stations with more than one
 * window open, so that trade does not work here.
 *
 * Instead, every open tab writes the current time to ALIVE_KEY every few
 * seconds. localStorage survives a shutdown; the WRITES do not. On a cold start
 * the newest timestamp is therefore from just before the machine went down —
 * minutes or hours ago — and the session is cleared. A reload, or a new tab
 * opened while the app is already running somewhere, finds a timestamp from
 * seconds ago and joins the session already in progress.
 *
 * This also survives "Continue where you left off" (Chrome) and Firefox session
 * restore. Those bring tabs back after a restart and restore sessionStorage
 * with them, so a sessionStorage marker would be restored too and would wrongly
 * look like a live session. A heartbeat cannot be restored, because no tab was
 * running while the machine was off.
 *
 * THE TWO THINGS THIS HAS TO GET RIGHT
 *
 *   1. SLEEP MUST NOT SIGN ANYONE OUT. Nothing runs while a machine is
 *      suspended, so the heartbeat goes stale exactly as it would in a
 *      shutdown. The difference is that the tab is still there: it beats again
 *      the moment the machine wakes (`visibilitychange`, `focus`, `pageshow`,
 *      and the interval), which is long before a human can reload anything. The
 *      only way to lose a session to sleep is to reload within a few hundred
 *      milliseconds of waking.
 *
 *   2. A NEW TAB MUST NOT SIGN ANYONE OUT while the app is open but HIDDEN.
 *      Chrome throttles timers in background tabs to about one wake per minute,
 *      so a heartbeat can legitimately be far older than the interval. Before
 *      clearing anything, a booting tab therefore PINGS the others over the
 *      `storage` event and waits briefly for an answer. Clearing is the last
 *      resort: a wrong clear signs the user out of every window they had open,
 *      which is the exact failure this file exists to remove.
 *
 * FAILING SAFE
 *
 * Every path that cannot read or write storage resolves to "someone is alive"
 * and clears nothing. A user locked out by a storage quirk is a far worse
 * outcome than a session that outlives one reboot.
 *
 * THE HONEST LIMIT
 *
 * Closing every tab and reopening within ALIVE_GRACE_MS keeps the session. That
 * is deliberate — it is what makes a reload cost nothing — and it is bounded by
 * the constant below.
 */

/** Newest "a tab of this app was running" timestamp, shared by all tabs. */
const ALIVE_KEY = 'vs_lastSeenAt';

/** Ping/answer pair used by a booting tab to find live tabs. Written and immediately removed; only the write carries a value. */
const PING_KEY = 'vs_sessionPing';
const PONG_KEY = 'vs_sessionPong';

/** How often a visible tab stamps ALIVE_KEY. */
const HEARTBEAT_MS = 5 * 1000;

/**
 * How stale ALIVE_KEY may be before a booting tab starts to suspect a restart.
 * Deliberately short: the ping below, not this window, is what protects
 * background tabs, so this does not need to absorb Chrome's throttling. Keeping
 * it short is what makes a fast reboot still end the session.
 */
const ALIVE_GRACE_MS = 30 * 1000;

/** How long a booting tab waits for another tab to answer its ping. */
const PONG_WAIT_MS = 300;

/**
 * Keys that outlive a session, listed explicitly rather than by clearing
 * everything else — the same shape as the mobile app's preserveAcrossLogout.
 * Theme is a device preference, and the remembered sign-in id and password are
 * the "remember me" box the user ticked on purpose; wiping either on sign-out
 * (which a bare localStorage.clear() did) makes both features look broken.
 */
const PRESERVED_KEYS = ['appTheme', 'visioSphere_savedId', 'visioSphere_savedPass'];

/**
 * End the session: drop the token and everything identifying the signed-in
 * user, keep the device preferences above.
 */
export const clearSession = () => {
  try {
    const kept = PRESERVED_KEYS
      .map((key) => [key, localStorage.getItem(key)])
      .filter(([, value]) => value !== null);

    localStorage.clear();

    for (const [key, value] of kept) localStorage.setItem(key, value);
  } catch {
    // Storage unavailable. Nothing to clear, and nothing we can do about it.
  }
};

/** Stamp "a tab is running right now". */
const beat = () => {
  try {
    localStorage.setItem(ALIVE_KEY, String(Date.now()));
  } catch {
    // Storage unavailable; the boot check fails safe on its own.
  }
};

/** Age of the newest heartbeat. Unreadable storage reports 0 so nothing is cleared. */
const heartbeatAge = () => {
  try {
    const last = Number(localStorage.getItem(ALIVE_KEY));
    return Number.isFinite(last) && last > 0 ? Date.now() - last : Infinity;
  } catch {
    return 0;
  }
};

/**
 * Answer other tabs' pings for the life of this tab. A `storage` event fires
 * only in tabs OTHER than the writer, which is exactly the question being
 * asked, so no self-filtering is needed.
 */
const answerPings = () => {
  window.addEventListener('storage', (event) => {
    if (event.key !== PING_KEY || !event.newValue) return;
    beat();
    try {
      localStorage.setItem(PONG_KEY, String(Date.now()));
      localStorage.removeItem(PONG_KEY);
    } catch {
      // Nothing useful to do; the asking tab will fall back to its own check.
    }
  });
};

/** True if some other tab of this app answers within PONG_WAIT_MS. */
const anotherTabIsAlive = () =>
  new Promise((resolve) => {
    let settled = false;
    let timer;

    const finish = (answer) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('storage', onStorage);
      window.clearTimeout(timer);
      resolve(answer);
    };

    function onStorage(event) {
      if (event.key === PONG_KEY && event.newValue) finish(true);
    }

    window.addEventListener('storage', onStorage);
    timer = window.setTimeout(() => finish(false), PONG_WAIT_MS);

    try {
      localStorage.setItem(PING_KEY, String(Date.now()));
      localStorage.removeItem(PING_KEY);
    } catch {
      finish(true); // Cannot ask, so assume yes and clear nothing.
    }
  });

/**
 * Decide once, at boot, whether this page load is a continuation of a running
 * browser or the first load after a restart — then keep the heartbeat going.
 *
 * Awaited before the app renders so no protected page is ever painted with a
 * token that is about to be thrown away. The wait only happens on the
 * ambiguous path; a normal reload resolves without any delay at all.
 */
/**
 * Is this page load provably a CONTINUATION of a running browser session?
 *
 * True only when the shared heartbeat is fresher than ALIVE_GRACE_MS — which is
 * exactly the condition under which startBrowserSessionGuard() below cannot
 * clear the session (it short-circuits before the ping). So a caller that gates
 * on this may act BEFORE the guard has finished without any risk of acting for
 * a session that is about to end.
 *
 * It exists so main.jsx can start the stream-token request without first
 * waiting out the guard's ping window. False is the safe answer and is what a
 * genuinely first load returns; the caller simply waits for the guard instead.
 */
export const sessionLooksContinuous = () => heartbeatAge() <= ALIVE_GRACE_MS;

export const startBrowserSessionGuard = async () => {
  answerPings();

  if (heartbeatAge() > ALIVE_GRACE_MS && !(await anotherTabIsAlive())) {
    clearSession();
  }

  beat();
  window.setInterval(beat, HEARTBEAT_MS);

  // A suspended machine runs nothing, so the heartbeat is stale the instant it
  // wakes. These fire on resume, on tab focus and on back/forward restore —
  // well before a person can reload — which is what keeps sleep from reading
  // as a shutdown.
  window.addEventListener('focus', beat);
  window.addEventListener('pageshow', beat);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) beat();
  });
};
