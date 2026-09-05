import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
// NOT a static import. socket.io-client is 42 KB (13 KB gzipped) and this
// provider sits above the router, so a static import welds it into the entry
// chunk — the one bundle every route must download, parse and EXECUTE before
// any page code runs. On /admin/monitoring that meant 13 KB of transport code
// was parsed before the request for the stream token could even be issued, and
// the camera image sits behind that request. Nothing here is needed until
// connect() is called from an effect, well after first paint.

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const MAX_ALERTS = 100;
const AlertContext = createContext(null);

/**
 * Fired by the sign-in screen the moment a token lands in localStorage.
 *
 * This provider sits ABOVE the router, so it does not remount when Login
 * navigates to a dashboard — nothing would otherwise tell it that a session
 * now exists. The browser's own `storage` event is not an option: it fires in
 * OTHER tabs, never in the one that performed the write, and sign-in happens
 * in this tab.
 */
export const AUTH_EVENT = "visiosphere:auth";

// Ids the user has dismissed, remembered locally.
//
// seedAlerts() REPLACES the whole list with whatever /incidents returns, and
// AdminDashboard calls it on every mount. So one trip to the Admin Hub and
// back resurrected everything the user had just cleared — the dismissals only
// ever existed in memory. If the PATCH .../dismiss request also fails (its
// error is swallowed), the server never learns either.
//
// This keeps a local tombstone list so a dismissal survives navigation and a
// failed request. Capped so it cannot grow without bound in a facility
// generating hundreds of alerts a day.
const DISMISSED_KEY = "dismissedAlertIds";
const MAX_DISMISSED = 500;

const loadDismissed = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]");
    return new Set(Array.isArray(raw) ? raw.map(String) : []);
  } catch {
    return new Set();
  }
};

const saveDismissed = (set) => {
  try {
    localStorage.setItem(
      DISMISSED_KEY,
      JSON.stringify([...set].slice(-MAX_DISMISSED)),
    );
  } catch {
    // storage full or unavailable — in-memory set still works this session
  }
};

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const attachedRef = useRef(false);
  const dismissedRef = useRef(loadDismissed());

  /**
   * Opens the alert socket. Safe to call repeatedly — the ref guard makes
   * every call after the first a no-op.
   */
  const connect = useCallback(() => {
    if (socketRef.current) return;
    // Claimed synchronously: connect() can be called twice before the dynamic
    // import settles (mount + AUTH_EVENT), and the ref guard above only helps
    // once socketRef is actually set. Without this, two sockets open.
    socketRef.current = 'pending';
    import("socket.io-client").then(({ io }) => {
    const socket = io(SOCKET_URL, {
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      // Function form (not a static object) so the latest token is read
      // from localStorage on every connect/reconnect attempt — matters
      // after a login, a token refresh, or a backend restart that forces
      // a reconnect while this provider stays mounted.
      auth: (cb) => cb({ token: localStorage.getItem("token") }),
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      // Most likely cause: missing/expired token in localStorage, now that
      // the backend rejects unauthenticated socket connections.
      console.warn("[Socket.io] connect_error:", err.message);
    });

    if (!attachedRef.current) {
      attachedRef.current = true;

      socket.on("dashboard_alert", (data) => {
        const normalized = {
          _id: data._id || `local-${Date.now()}-${Math.random()}`,
          severity:
            data.severity ||
            (data.type === "EMERGENCY" ? "Emergency" : "Warning"),
          incidentType: data.incidentType || "Alert",
          location: data.location || "Unknown",
          description: data.description || "",
          rawMessage: data.rawMessage || data.message || "",
          createdAt: data.createdAt || new Date().toISOString(),
          timestamp: data.timestamp || new Date().toLocaleTimeString(),
          acknowledged: !!data.acknowledged,
          isResolved: !!data.isResolved,
          resolverName: data.resolverName || null,
          type: data.type,
          alertKey: data.alertKey,
          clipPath: data.clipPath,
          trackId: data.trackId,
        };
        // Already dismissed here — don't let a re-broadcast bring it back.
        if (dismissedRef.current.has(String(normalized._id))) return;
        setAlerts((prev) => {
          const idx = prev.findIndex((a) => a._id === normalized._id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = normalized;
            return next;
          }
          return [normalized, ...prev].slice(0, MAX_ALERTS);
        });
        if (
          !normalized.acknowledged &&
          !String(normalized._id).startsWith("local-")
        ) {
          setUnreadCount((c) => c + 1);
        }
      });

      socket.on("dashboard_alert_clip", ({ _id, clipPath }) => {
        if (!_id || !clipPath) return;
        setAlerts((prev) =>
          prev.map((a) =>
            String(a._id) === String(_id) ? { ...a, clipPath } : a,
          ),
        );
      });

      socket.on("incident_resolved", ({ _id, resolverName, resolvedAt }) => {
        setAlerts((prev) =>
          prev.map((a) =>
            String(a._id) === String(_id)
              ? { ...a, isResolved: true, resolverName, resolvedAt }
              : a,
          ),
        );
        setUnreadCount((c) => Math.max(0, c - 1));
        setTimeout(() => {
          setAlerts((prev) =>
            prev.filter((a) => String(a._id) !== String(_id)),
          );
        }, 10_000);
      });
    }
    }).catch((err) => {
      // The chunk failed to load (offline, a stale deploy). Release the claim
      // so a later connect() — a reconnect, or the AUTH_EVENT after sign-in —
      // can try again instead of believing a socket already exists.
      socketRef.current = null;
      console.warn("[Socket.io] could not load the client:", err?.message);
    });

    return () => {};
  }, []);

  /**
   * CONNECT ONLY WHEN THERE IS A SESSION TO CONNECT WITH.
   *
   * This used to fire on mount unconditionally, so every visitor to the
   * sign-in page opened a socket the backend then refused for having no
   * token — a request on the critical path that can hang for the better part
   * of a minute while a sleeping Render instance wakes, and a console error
   * on the one page that should be cheapest to load.
   *
   * Signing in dispatches AUTH_EVENT, which connects immediately. Once
   * connected, socket.io's own infinite retry (see reconnection settings
   * above) keeps it alive, and its auth callback re-reads the token on every
   * attempt, so a refreshed token still works without a reload.
   */
  useEffect(() => {
    if (localStorage.getItem("token")) connect();

    const onAuth = () => connect();
    window.addEventListener(AUTH_EVENT, onAuth);
    return () => window.removeEventListener(AUTH_EVENT, onAuth);
  }, [connect]);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  }, []);

  const acknowledgeAlert = useCallback((_id) => {
    setAlerts((prev) =>
      prev.map((a) =>
        String(a._id) === String(_id) ? { ...a, acknowledged: true } : a,
      ),
    );
  }, []);

  const dismissAlert = useCallback((_id) => {
    dismissedRef.current.add(String(_id));
    saveDismissed(dismissedRef.current);
    setAlerts((prev) => prev.filter((a) => String(a._id) !== String(_id)));
  }, []);

  const resolveAlert = useCallback((_id, resolverName) => {
    setAlerts((prev) =>
      prev.map((a) =>
        String(a._id) === String(_id)
          ? { ...a, isResolved: true, resolverName }
          : a,
      ),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => String(a._id) !== String(_id)));
    }, 10_000);
  }, []);

  const seedAlerts = useCallback((items) => {
    // Drop anything already dismissed here. Without this, every mount of a
    // page that seeds (AdminDashboard does, on entry) undid the user's work.
    const fresh = (items || []).filter(
      (a) => !dismissedRef.current.has(String(a._id)),
    );
    setAlerts(fresh.slice(0, MAX_ALERTS));
  }, []);

  const seedUnreadCount = useCallback((count) => {
    setUnreadCount(count);
  }, []);

  return (
    <AlertContext.Provider
      value={{
        alerts,
        unreadCount,
        isConnected,
        markAllRead,
        acknowledgeAlert,
        dismissAlert,
        resolveAlert,
        seedAlerts,
        seedUnreadCount,
      }}
    >
      {children}
    </AlertContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAlerts = () => {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error("useAlerts must be used inside <AlertProvider>");
  return ctx;
};
