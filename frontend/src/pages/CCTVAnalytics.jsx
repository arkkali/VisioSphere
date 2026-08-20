import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Sidebar from '../components/Sidebar';
import CameraGrid from '../components/cctv/CameraGrid';
import CameraFeedPanel from '../components/cctv/CameraFeedPanel';
import CameraToolbar from '../components/cctv/CameraToolbar';
import AlertSidebar from '../components/cctv/AlertSidebar';
import ResolveConfirmModal from '../components/cctv/ResolveConfirmModal';
import ToastNotification from '../components/cctv/ToastNotification';
import DebugPanel from '../components/cctv/DebugPanel';
import { resolveAlertMeta } from '../components/cctv/alertMeta';
import { dismissIncident, resolveIncident } from '../services/cctvService';
import { camerasForCurrentUser, withLiveStatus, activeCameraCount, totalCameraCount } from '../constants/cameras';
import { useCameraHealth } from '../hooks/useCameraHealth';
import { useAlertSound } from '../hooks/useAlertSound';
import { useAlerts } from '../context/AlertContext';

const StatItem = ({ label, value, variant = 'default' }) => (
  <div className="flex flex-col items-end gap-0.5">
    <span className="text-[10px] text-[#9a9eab] dark:text-slate-400 font-bold tracking-widest uppercase">{label}</span>
    <span className={`text-2xl font-black leading-none tracking-tight ${variant === 'alert' ? 'text-[#ff4757] dark:text-rose-500' : 'text-[#003543] dark:text-white'}`}>
      {value}
    </span>
  </div>
);

const hydrateIncident = (inc) => {
  const type    = inc.severity === 'Emergency' ? 'EMERGENCY' : inc.severity === 'Warning' ? 'WARNING' : 'INFO';
  const message = inc.rawMessage || inc.description || '';
  const meta    = resolveAlertMeta(message, type);
  return {
    _id:          inc._id,
    rawType:      type,
    module:       meta.module,
    label:        meta.label,
    severity:     inc.severity,
    camera:       inc.location,
    message,
    timestamp:    inc.createdAt ? new Date(inc.createdAt).toLocaleTimeString() : inc.timestamp || '',
    status:       inc.acknowledged ? 'Resolved' : 'Unresolved',
    clipPath:     inc.clipPath,
    isResolved:   !!inc.isResolved,
    resolverName: inc.resolverName || null,
    incidentType: inc.incidentType || meta.label,
    location:     inc.location,
  };
};

const CCTVAnalytics = () => {
  const [filterModule,      setFilterModule]      = useState('All');
  const [selectedCameraId,  setSelectedCameraId]  = useState('OVERALL');
  const [realTimeStatuses,  setRealTimeStatuses]  = useState({});
  const [toasts,            setToasts]            = useState([]);
  const [showDebug,         setShowDebug]         = useState(false);
  const [debugEvents,       setDebugEvents]       = useState([]);
  const [resolveTarget,     setResolveTarget]     = useState(null);
  const [isResolving,       setIsResolving]       = useState(false);
  const toastTimeouts = useRef(new Map());

  // Cameras belong to a facility. Resolved here rather than at module scope,
  // because this file is imported before login writes the facility.
  const baseCameras  = useMemo(() => camerasForCurrentUser(), []);
  // Active/Inactive is LIVE — polled from ai_core, not read off a constant.
  const health       = useCameraHealth();
  const CAMERAS      = useMemo(() => withLiveStatus(baseCameras, health), [baseCameras, health]);
  const activeCount  = useMemo(() => activeCameraCount(CAMERAS), [CAMERAS]);
  const totalCount   = useMemo(() => totalCameraCount(baseCameras), [baseCameras]);

  const { playAlertSound }                        = useAlertSound();
const { alerts: contextAlerts,
        dismissAlert:  ctxDismiss,
        resolveAlert:  ctxResolve }              = useAlerts();

  const alerts = useMemo(() => contextAlerts.map(hydrateIncident), [contextAlerts]);

  const prevLengthRef = useRef(null);
  useEffect(() => {
    // On (re)mount, baseline to the current alert count so alerts that already
    // existed before this page mounted are NOT replayed as toasts. Without this,
    // leaving and returning to the CCTV tab re-fires the most recent alert.
    if (prevLengthRef.current === null) {
      prevLengthRef.current = contextAlerts.length;
      return;
    }
    if (contextAlerts.length <= prevLengthRef.current) {
      prevLengthRef.current = contextAlerts.length;
      return;
    }

    const newItems = contextAlerts.slice(0, contextAlerts.length - prevLengthRef.current);
    prevLengthRef.current = contextAlerts.length;

    newItems.forEach(data => {
      setRealTimeStatuses(prev => ({
        ...prev,
        [data.location]: { status: data.rawMessage || data.description, type: data.type },
      }));

      setDebugEvents(prev => [data, ...prev].slice(0, 5));

      if (data.type !== 'INFO' && data.severity !== 'Info') {
        const toastId = Date.now() + Math.random();
        const toast   = { ...data, id: toastId };
        setToasts(prev => [toast, ...prev].slice(0, 3));
        const tid = setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toastId));
          toastTimeouts.current.delete(toastId);
        }, 6000);
        toastTimeouts.current.set(toastId, tid);
      }

      playAlertSound(data.severity);
    });
  }, [contextAlerts, playAlertSound]);

  useEffect(() => {
    const timeouts = toastTimeouts.current;
    return () => { timeouts.forEach(clearTimeout); timeouts.clear(); };
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const filteredAlerts = useMemo(() => {
    if (filterModule === 'All')        return alerts;
    if (filterModule === 'Unresolved') return alerts.filter(a => a.status === 'Unresolved');
    return alerts.filter(a => a.module === filterModule);
  }, [alerts, filterModule]);

  const handleDismiss = useCallback(async (id) => {
    ctxDismiss(String(id));
    if (!id || String(id).startsWith('local-')) return;
    const userId = localStorage.getItem('userId') || null;
    try {
      await dismissIncident(id, userId);
    } catch {
      // alert already removed from context — leave it removed
    }
  }, [ctxDismiss]);

  const handleResolveIntent = useCallback((alert) => {
    setResolveTarget(alert);
  }, []);

  const handleConfirmResolve = useCallback(async () => {
    if (!resolveTarget) return;
    const { _id, isResolved } = resolveTarget;
    const userId       = localStorage.getItem('userId') || null;
    const resolverName = localStorage.getItem('userName') || 'Staff';

    if (isResolved) {
      setResolveTarget(null);
      return;
    }

    if (String(_id).startsWith('local-')) {
      ctxResolve(String(_id), resolverName);
      setResolveTarget(null);
      return;
    }

    setIsResolving(true);
    try {
      await resolveIncident(_id, userId);
    } catch {
      // socket broadcast from server will update all clients
      // if the call fails the DB won't update — leave modal open
      setIsResolving(false);
      return;
    }
    setIsResolving(false);
    setResolveTarget(null);
  }, [resolveTarget, ctxResolve]);

  const handleCloseModal = useCallback(() => {
    if (isResolving) return;
    setResolveTarget(null);
  }, [isResolving]);

  const getCameraStatus  = useCallback((camId) => realTimeStatuses[camId]?.status || 'NORMAL', [realTimeStatuses]);
  const selectedCamera   = CAMERAS.find(c => c.cameraId === selectedCameraId);
  const unresolvedCount  = alerts.filter(a => !a.isResolved && a.status === 'Unresolved').length;

  return (
    <>
      <style>{`
        @keyframes slideIn  { from { transform: translateX(110%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes progress { from { width: 100%; } to { width: 0%; } }
      `}</style>

      <ResolveConfirmModal
        show={!!resolveTarget}
        onClose={handleCloseModal}
        onConfirm={handleConfirmResolve}
        incident={resolveTarget}
        isSubmitting={isResolving}
      />

      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastNotification toast={t} onDismiss={dismissToast} />
          </div>
        ))}
      </div>

      {showDebug && <DebugPanel events={debugEvents} />}

      <div className="flex h-screen bg-[#f5f7f9] dark:bg-slate-900 overflow-hidden font-sans transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative ml-0 md:ml-[250px]">
          <header className="shrink-0 bg-white dark:bg-slate-800 border-b border-[#e2e8f0] dark:border-slate-700 px-6 py-3 flex justify-between items-center z-10 shadow-sm transition-colors duration-300">
            <div>
              <h1 className="text-xl text-[#003543] dark:text-white font-extrabold m-0 tracking-tight">CCTV Analytics Hub</h1>
              <p className="text-[#9a9eab] dark:text-slate-400 font-medium m-0 mt-0.5 text-[11px] uppercase tracking-wide">AI-Powered Elderly Monitoring</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="hidden md:flex items-center gap-3">
                {[
                  { label: 'Fall',       color: 'bg-[#ef4444]' },
                  { label: 'Agitation',  color: 'bg-[#a855f7]' },
                  { label: 'Pacing',     color: 'bg-[#f97316]' },
                  { label: 'Inactivity', color: 'bg-[#eab308]' },
                  { label: 'Lying Down', color: 'bg-[#64748b]' },
                ].map(m => (
                  <div key={m.label} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${m.color}`} />
                    <span className="text-[10px] font-bold text-[#9a9eab] dark:text-slate-400 uppercase tracking-wide">{m.label}</span>
                  </div>
                ))}
              </div>
              <StatItem label="Active Cameras" value={`${activeCount}/${totalCount}`} />
              <StatItem label="Unresolved"     value={unresolvedCount} variant="alert" />
              <button
                onClick={() => setShowDebug(p => !p)}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full border transition-all uppercase tracking-widest ${showDebug ? 'bg-[#003543] dark:bg-[#38bdf8] text-[#00a8e8] dark:text-slate-900 border-[#00a8e8] dark:border-[#38bdf8]' : 'bg-white dark:bg-slate-800 text-[#9a9eab] dark:text-slate-400 border-[#e2e8f0] dark:border-slate-700 hover:border-[#003543] dark:hover:border-slate-400'}`}
              >
                {showDebug ? '🔬 Debug ON' : '🔬 Debug'}
              </button>
            </div>
          </header>

          <div className="flex-1 flex gap-4 p-4 min-h-0 overflow-hidden">
            <div className="flex-1 flex flex-col min-w-0 gap-3 h-full">
              <CameraToolbar cameras={CAMERAS} selectedCameraId={selectedCameraId} onSelect={setSelectedCameraId} />
              <div className="flex-1 rounded-xl overflow-y-auto scrollbar-hide relative flex flex-col">
                {selectedCameraId === 'OVERALL'
                  ? <CameraGrid cameras={CAMERAS} getCameraStatus={getCameraStatus} />
                  : <CameraFeedPanel camera={selectedCamera} getCameraStatus={getCameraStatus} />
                }
              </div>
            </div>
            <AlertSidebar
              filteredAlerts={filteredAlerts}
              filterModule={filterModule}
              onFilterChange={setFilterModule}
              unresolvedCount={unresolvedCount}
              onResolveIntent={handleResolveIntent}
              onDismiss={handleDismiss}
            />
          </div>
        </main>
      </div>
    </>
  );
};

export default CCTVAnalytics;