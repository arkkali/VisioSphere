import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";
const MAX_ALERTS = 100;
const AlertContext = createContext(null);

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);
  const attachedRef = useRef(false);

  useEffect(() => {
    if (socketRef.current) return;
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

    return () => {};
  }, []);

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
    setAlerts(items.slice(0, MAX_ALERTS));
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
