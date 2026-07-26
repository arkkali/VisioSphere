import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import axios from 'axios';
import axiosInstance from '../api/axiosInstance';

import { useAlerts } from '../context/AlertContext';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import { useAlertSound } from '../hooks/useAlertSound';
import BentoStatCard from '../components/dashboard/BentoStatCard';
import AlertsChartWidget from '../components/dashboard/AlertsChartWidget';
import WeekDetailModal from '../components/dashboard/WeekDetailModal';
import AlertHistoryModal from '../components/dashboard/AlertHistoryModal';
import dashboardService from '../services/dashboardService';
import { ACTIVE_CAMERA_COUNT, TOTAL_CAMERA_COUNT } from '../constants/cameras';

const incidentTypeToCategory = (incidentType) => {
  switch (incidentType) {
    case 'Fall':
    case 'Prolonged Fall':       return 'Fall';
    case 'Agitation':            return 'Agitation';
    case 'Pacing':               return 'Pacing';
    case 'Inactivity':
    case 'Inactivity (Posture)': return 'Inactivity';
    case 'Lying Down':           return 'Lying Down';
    default:                     return null;
  }
};

const emptyDayRow = (name, dateISO) => ({
  name, date: dateISO, alerts: 0,
  Fall: 0, Agitation: 0, Pacing: 0, Inactivity: 0, 'Lying Down': 0,
});

const localDateStr = (d) => {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const sundayOfWeek = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

const DEFAULT_STAT        = { current: 0, diff: 0, direction: 'neutral', label: 'No changes since last month' };
const DEFAULT_ALERT_STAT  = { current: 0, diff: 0, direction: 'neutral', label: 'No changes since yesterday' };
const DEFAULT_CAMERA_STAT = {
  online: ACTIVE_CAMERA_COUNT,
  total: TOTAL_CAMERA_COUNT,
  label: `${ACTIVE_CAMERA_COUNT} / ${TOTAL_CAMERA_COUNT} online`,
  direction: 'none',
};

const AdminDashboard = () => {
  const { theme } = useTheme();
  const isDark = theme === 'dark' || (theme === 'default' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const location    = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');

  const {
    alerts: contextAlerts,
    unreadCount,
    markAllRead,
    acknowledgeAlert: ctxAcknowledge,
    seedAlerts,
    seedUnreadCount,
  } = useAlerts();

  const { playAlertSound } = useAlertSound();

  const [statsData, setStatsData] = useState({
    elders:  DEFAULT_STAT,
    nurses:  DEFAULT_STAT,
    alerts:  DEFAULT_ALERT_STAT,
    cameras: DEFAULT_CAMERA_STAT,
  });
  const [statsLoading, setStatsLoading] = useState(true);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const [retryCount,   setRetryCount]   = useState(0);

  const [adminProfile, setAdminProfile] = useState({ name: 'User', role: 'Administrator', id: 'Unknown' });
  const [profilePic,   setProfilePic]   = useState(null);
  const [isUploading,  setIsUploading]  = useState(false);
  const fileInputRef = useRef(null);

  const [showNotifications, setShowNotifications] = useState(false);
  const bellRef = useRef(null);

  const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [alertData, setAlertData] = useState(() => {
    const start = sundayOfWeek();
    return [...Array(7)].map((_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return emptyDayRow(
        d.toLocaleDateString('en-US', { weekday: 'short' }),
        localDateStr(d),
      );
    });
  });

  const [showHistory,          setShowHistory]          = useState(false);
  const [historyWeeks,         setHistoryWeeks]         = useState([]);
  const [historyLoading,       setHistoryLoading]       = useState(false);
  const [calendarMonth,        setCalendarMonth]        = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [hoveredRow,           setHoveredRow]           = useState(null);
  const [selectedWeek,         setSelectedWeek]         = useState(null);
  const [selectedWeekData,     setSelectedWeekData]     = useState(null);
  const [selectedWeekLoading,  setSelectedWeekLoading]  = useState(false);

  const incidentToNotif = (incident) => {
    const sev      = incident.severity || (incident.type === 'EMERGENCY' ? 'Emergency' : 'Warning');
    const hasRealId = incident._id && !String(incident._id).startsWith('local-');
    return {
      _id:          hasRealId ? incident._id : `local-${Date.now()}-${Math.random()}`,
      severity:     sev,
      incidentType: incident.incidentType || 'Alert',
      location:     incident.location     || 'Unknown location',
      description:  incident.description  || `${incident.incidentType || 'Alert'} - ${incident.location || 'Unknown'}`,
      time:         incident.createdAt
        ? new Date(incident.createdAt).toLocaleTimeString()
        : incident.timestamp || new Date().toLocaleTimeString(),
      acknowledged: !!incident.acknowledged,
      isLocal:      !hasRealId,
    };
  };

  const notifications = contextAlerts.map(incidentToNotif);

  const prevAlertCount = useRef(null); // null = initial seed not yet received
  useEffect(() => {
    if (prevAlertCount.current === null) return; // wait for seed baseline
    if (contextAlerts.length > prevAlertCount.current) {
      const newest = contextAlerts[0];
      if (newest && !newest.acknowledged) {
        playAlertSound(newest.severity);
      }
    }
    prevAlertCount.current = contextAlerts.length;
  }, [contextAlerts, playAlertSound]);

  const seenAlertIds = useRef(new Set());
  useEffect(() => {
    if (contextAlerts.length === 0) return;
    const newest = contextAlerts[0];
    if (!newest || seenAlertIds.current.has(newest._id)) return;
    seenAlertIds.current.add(newest._id);

    const todayLocal = localDateStr(new Date());
    const category   = incidentTypeToCategory(newest.incidentType);
    setAlertData(prev =>
      prev.map(d => {
        if (d.date !== todayLocal) return d;
        const next = { ...d, alerts: d.alerts + 1 };
        if (category) next[category] = (next[category] || 0) + 1;
        return next;
      })
    );

    dashboardService.getStatsComparison()
      .then(data => setStatsData(prev => ({ ...prev, ...data })))
      .catch(() => {});
  }, [contextAlerts]);

  useEffect(() => {
    dashboardService.getRecentIncidents()
      .then(items => {
        prevAlertCount.current = items.length; // baseline before seeding to suppress login sound
        seedAlerts(items);
      })
      .catch(() => {
        prevAlertCount.current = 0; // unblock on error
      });

    dashboardService.getUnreadCount()
      .then(count => seedUnreadCount(count))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showNotifications]);

  useEffect(() => {
    const storedName = localStorage.getItem('userName') || localStorage.getItem('nurseName') || localStorage.getItem('adminName') || 'User';
    const storedRole = localStorage.getItem('userRole') || localStorage.getItem('adminRole') || 'Administrator';
    const storedId   = localStorage.getItem('userId')   || localStorage.getItem('nurseId')   || localStorage.getItem('adminId') || 'Unknown';
    const storedPic  = isNurseView
      ? localStorage.getItem('nurseProfilePic')
      : localStorage.getItem('adminProfilePic');

    setAdminProfile({ name: storedName, role: storedRole, id: storedId });
    if (storedPic && storedPic !== 'undefined') setProfilePic(storedPic);
    else setProfilePic(null);

    setStatsLoading(true);
    dashboardService.getStatsComparison()
      .then(data => setStatsData(prev => ({ ...prev, ...data })))
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    const abortController = new AbortController();
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);
        if (isNurseView) {
          if (storedId.startsWith('A-') || storedId.startsWith('N-')) {
            try {
              const route = storedId.startsWith('A-')
                ? `/nurses/linked-profile/${storedId}`
                : `/nurses/${storedId}`;
              const nurseRes = await axiosInstance.get(route, { signal: abortController.signal });
              if (nurseRes.data) {
                setAdminProfile({
                  name: `${nurseRes.data.firstName} ${nurseRes.data.lastName}`,
                  role: 'Nurse',
                  id:   nurseRes.data.nurseId,
                });
                if (nurseRes.data.profilePic) {
                  setProfilePic(nurseRes.data.profilePic);
                  localStorage.setItem('nurseProfilePic', nurseRes.data.profilePic);
                }
              }
            } catch (nurseErr) {
              if (!axios.isCancel(nurseErr))
                setAdminProfile({ name: storedName, role: storedRole, id: storedId });
            }
          }
        }
      } catch (err) {
        if (axios.isCancel(err)) return;
        setError(err.response
          ? `System Error: ${err.response.status} - ${err.response.data?.message || 'Access Restricted'}`
          : 'Secure connection timeout. Verify network status.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    return () => abortController.abort();
  }, [retryCount, isNurseView]);

  useEffect(() => {
    const weekStart = localDateStr(sundayOfWeek());
    dashboardService.getWeeklyStats(weekStart, userTz)
      .then(rows => {
        setAlertData(rows.map(row => {
          const d = new Date(row.date + 'T00:00:00');
          return {
            name:         d.toLocaleDateString('en-US', { weekday: 'short' }),
            alerts:       row.total      || 0,
            date:         row.date,
            Fall:         row.Fall       || 0,
            Agitation:    row.Agitation  || 0,
            Pacing:       row.Pacing     || 0,
            Inactivity:   row.Inactivity || 0,
            'Lying Down': row['Lying Down'] || 0,
          };
        }));
      })
      .catch(() => {});
  }, [userTz]);

  const handleRetry = () => setRetryCount(prev => prev + 1);

  const handleBellClick = async () => {
    setShowNotifications(prev => !prev);
    const unacked = notifications.filter(n => !n.acknowledged && !n.isLocal);
    if (unacked.length === 0) {
      markAllRead();
      return;
    }
    markAllRead();
    const userId = localStorage.getItem('userId') || null;
    try {
      await dashboardService.acknowledgeIncidents(unacked.map(n => n._id), userId);
      unacked.forEach(n => ctxAcknowledge(n._id));
} catch (_) {
      void _;
    }
  };

  const handleClearAll = () => seedAlerts([]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file?.type.startsWith('image/')) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image is too large. Please select an image under 2MB.');
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result;
      try {
        if (isNurseView) {
          let targetId = adminProfile.id;
          if (targetId.startsWith('A-')) {
            const nurseRes = await axiosInstance.get(`/nurses/linked-profile/${targetId}`);
            targetId = nurseRes.data.nurseId;
          }
          if (targetId?.startsWith('N-')) {
            await axiosInstance.post('/nurses/upload-profile-pic', { nurseId: targetId, imageBase64: base64String });
            setProfilePic(base64String);
            localStorage.setItem('nurseProfilePic', base64String);
          }
        } else {
          await axiosInstance.post('/admin/upload-profile-pic', { customId: adminProfile.id, imageBase64: base64String });
          setProfilePic(base64String);
          localStorage.setItem('adminProfilePic', base64String);
        }
      } catch {
        alert('Failed to save profile picture to server.');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const calendarGrid = (() => {
    const year     = calendarMonth.getFullYear();
    const month    = calendarMonth.getMonth();
    const first    = new Date(year, month, 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    const rows = [];
    for (let r = 0; r < 6; r++) {
      const days = [];
      for (let c = 0; c < 7; c++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + r * 7 + c);
        days.push(d);
      }
      rows.push(days);
    }
    return rows;
  })();

  const openHistory = async () => {
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const weeks = [];
      for (let i = 0; i <= 4; i++) {
        const start = sundayOfWeek();
        start.setDate(start.getDate() - i * 7);
        const startISO = localDateStr(start);
        const rows     = await dashboardService.getWeeklyStats(startISO, userTz);
        const end      = new Date(start);
        end.setDate(start.getDate() + 6);
        const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weeks.push({
          startISO,
          label: `${fmt(start)} — ${fmt(end)}`,
          total: rows.reduce((acc, r) => acc + (r.total || 0), 0),
          days:  rows.map(r => ({
            name:         new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
            alerts:       r.total      || 0,
            date:         r.date,
            Fall:         r.Fall       || 0,
            Agitation:    r.Agitation  || 0,
            Pacing:       r.Pacing     || 0,
            Inactivity:   r.Inactivity || 0,
            'Lying Down': r['Lying Down'] || 0,
          })),
        });
      }
      setHistoryWeeks(weeks);
    } catch {
      setHistoryWeeks([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openWeekDetail = async (anchorDate) => {
    const start = sundayOfWeek(anchorDate);
    const end   = new Date(start);
    end.setDate(start.getDate() + 6);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    setSelectedWeek({ startISO: localDateStr(start), label: `${fmt(start)} — ${fmt(end)}`, start, end });
    setSelectedWeekLoading(true);
    setSelectedWeekData(null);
    try {
      const rows = await dashboardService.getWeeklyStats(localDateStr(start), userTz);
      setSelectedWeekData({
        startISO: localDateStr(start),
        label:    `${fmt(start)} — ${fmt(end)}`,
        total:    rows.reduce((acc, r) => acc + (r.total || 0), 0),
        days:     rows.map(r => ({
          name:         new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' }),
          alerts:       r.total      || 0,
          date:         r.date,
          Fall:         r.Fall       || 0,
          Agitation:    r.Agitation  || 0,
          Pacing:       r.Pacing     || 0,
          Inactivity:   r.Inactivity || 0,
          'Lying Down': r['Lying Down'] || 0,
        })),
      });
    } catch {
      setSelectedWeekData({ days: [], total: 0, label: '' });
    } finally {
      setSelectedWeekLoading(false);
    }
  };

  const closeWeekDetail = () => { setSelectedWeek(null); setSelectedWeekData(null); };

  const formattedAlerts  = String(statsData.alerts.current  ?? 0).padStart(2, '0');
  const formattedCameras = String(statsData.cameras.online  ?? ACTIVE_CAMERA_COUNT).padStart(2, '0');

  return (
    <>
      <style>{`
        .alert-sound-ripple {
          position: absolute; inset: 0; border-radius: 50%;
          border: 2px solid #00a8e8;
          animation: ripple 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; opacity: 0;
        }
        .alert-sound-ripple-delay-1 { animation-delay: 0.4s; }
        .alert-sound-ripple-delay-2 { animation-delay: 0.8s; }
        @keyframes ripple { 0% { transform: scale(1); opacity: 0.8; } 100% { transform: scale(2); opacity: 0; } }
        .dashboard-grid { display: grid; grid-template-rows: auto 1fr; gap: 12px; height: 100%; }
        .dashboard-row { display: grid; gap: 12px; min-height: 0; }
        .dashboard-row-stats { grid-template-columns: repeat(4, 1fr); }
        .dashboard-row-main  { grid-template-columns: 1fr; }
      `}</style>

      <div className="flex bg-[#f1f5f9] dark:bg-[#1c2c2f] h-screen w-screen overflow-hidden font-['Outfit',sans-serif] transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-4 flex flex-col h-full overflow-hidden gap-3">

          <div className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-sm border border-[#e2e8f0] dark:border-[#00435c] px-5 py-3 flex justify-between items-center shrink-0 z-50">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="text-[1.15rem] text-[#00212e] dark:text-white m-0 font-black tracking-tight leading-none flex items-center gap-1.5">
                  Welcome back, <span className="text-[#00a8e8]">{adminProfile.name.split(' ')[0]}</span>
                </h1>
                <p className="text-[0.75rem] text-[#5a6265] dark:text-[#668894] font-semibold m-0 mt-0.5 leading-none">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="relative" ref={bellRef}>
                <button onClick={handleBellClick}
                  className="relative w-[38px] h-[38px] bg-[#eaf8fe] dark:bg-[#0075a2] rounded-full border-none flex items-center justify-center cursor-pointer shadow-sm transition-transform hover:scale-105 active:scale-95">
                  <svg width="17" height="17" viewBox="0 0 24 24"
                    fill={unreadCount > 0 ? '#00a8e8' : 'none'}
                    stroke={unreadCount > 0 ? '#00a8e8' : (isDark ? '#ccedfa' : '#00435c')}
                    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#ff4757] text-white text-[9px] font-bold min-w-[17px] h-[17px] flex items-center justify-center rounded-full border-2 border-white dark:border-[#00212e]">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 z-50 bg-white dark:bg-[#00435c] rounded-2xl shadow-xl border border-[#eaf8fe] dark:border-[#00212e] w-[360px] overflow-hidden">
                    <div className="px-4 py-3 bg-[#f9fdfe] dark:bg-[#00212e] border-b border-[#eaf8fe] dark:border-[#00435c] flex justify-between items-center">
                      <div>
                        <p className="m-0 font-black text-[#00212e] dark:text-white text-sm">Alerts</p>
                        <p className="m-0 text-xs text-[#5a6265] dark:text-[#a6aeb2] font-medium mt-0.5">{notifications.length} recent</p>
                      </div>
                      <button onClick={handleClearAll} className="text-xs text-[#00a8e8] font-bold uppercase cursor-pointer bg-transparent border-none hover:underline">Clear</button>
                    </div>
                    <div className="max-h-[26rem] overflow-y-auto custom-scrollbar">
                      {notifications.length === 0 ? (
                        <p className="text-center text-sm text-[#9dabb1] dark:text-[#668894] py-8 m-0 font-medium">No alerts yet.</p>
                      ) : (
                        notifications.map((n, i) => (
                          <div key={`${n._id}-${i}`} className="p-3.5 border-b border-[#f3fbfe] dark:border-[#00435c]/50 hover:bg-[#f9fdfe] dark:hover:bg-[#00435c]">
                            <div className="flex justify-between items-center mb-1">
                              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full text-white ${n.severity === 'Emergency' ? 'bg-[#ff4757]' : 'bg-[#eab308]'}`}>
                                {n.severity.toUpperCase()}
                              </span>
                              <span className="text-xs text-[#9dabb1] dark:text-[#a6aeb2] font-medium">{n.time}</span>
                            </div>
                            <p className="m-0 font-bold text-sm text-[#00212e] dark:text-[#ccedfa] mt-1.5">{n.incidentType}</p>
                            <p className="m-0 text-xs text-[#00a8e8] dark:text-[#4cc2ee] font-semibold mt-0.5">{n.location}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2.5 pl-3 border-l border-[#eaf8fe] dark:border-[#0075a2]">
                <div className="relative w-[38px] h-[38px] rounded-full border-2 border-white dark:border-[#00435c] shadow-sm overflow-hidden flex items-center justify-center bg-[#e1f5fe] dark:bg-[#0075a2] cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => !isUploading && fileInputRef.current?.click()}>
                  {isUploading ? (
                    <div className="w-4 h-4 border-2 border-[#00a8e8] border-t-transparent rounded-full animate-spin" />
                  ) : profilePic ? (
                    <img src={profilePic} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-bold text-sm text-[#0075a2] dark:text-[#e1f5fe]">{adminProfile.name.charAt(0)}</span>
                  )}
                  <input type="file" accept="image/*" ref={fileInputRef} className="hidden" onChange={handleImageUpload} disabled={isUploading} />
                </div>
                <div className="hidden lg:block">
                  <p className="m-0 font-black text-[0.8rem] text-[#00212e] dark:text-white leading-none">{adminProfile.name.split(' ')[0]}</p>
                  <p className="m-0 text-[0.7rem] text-[#5a6265] dark:text-[#668894] font-semibold mt-0.5 leading-none">{adminProfile.role}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-white dark:bg-[#00212e] rounded-[24px] shadow-sm border border-[#e2e8f0] dark:border-[#00435c] overflow-hidden">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="w-10 h-10 border-4 border-[#00a8e8] border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 font-bold text-[#5a6265] dark:text-[#a6aeb2] text-sm">Loading Dashboard...</p>
              </div>
            ) : (
              <div className="h-full p-4 lg:p-5 dashboard-grid">
                <div className="dashboard-row dashboard-row-stats shrink-0">
                  <BentoStatCard title="Total Elders"   value={statsLoading ? '—' : String(statsData.elders.current).padStart(2, '0')}  statData={statsData.elders}  isDark={isDark} bgColor="bg-[#00a8e8] dark:bg-[#00435c]"     primaryColor="text-white dark:text-[#ccedfa]"       compact icon={<svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>} />
                  <BentoStatCard title="Active Nurses"  value={statsLoading ? '—' : String(statsData.nurses.current).padStart(2, '0')}  statData={statsData.nurses}  isDark={isDark} bgColor="bg-[#e1f5fe] dark:bg-[#00212e]"     primaryColor="text-[#0075a2] dark:text-[#4cc2ee]"  compact icon={<svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>} />
                  <BentoStatCard title="Cameras Online" value={statsLoading ? '—' : formattedCameras}                                   statData={statsData.cameras} isDark={isDark} bgColor="bg-[#e8f8fb] dark:bg-[#1c2c2f]"     primaryColor="text-[#649ca7] dark:text-[#b1e9f3]"  compact icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>} />
                  <BentoStatCard title="Alerts Today"   value={statsLoading ? '—' : formattedAlerts}                                    statData={statsData.alerts}  isDark={isDark} bgColor="bg-[#fff1f2] dark:bg-[#ff4757]/10" primaryColor="text-[#e11d48] dark:text-[#ff4757]"   compact icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-5 h-5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>} />
                </div>

                {error && (
                  <div className="bg-[#fff1f2] dark:bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#e11d48] dark:text-[#ff4757] px-4 py-2.5 rounded-xl flex justify-between items-center">
                    <p className="m-0 font-semibold text-sm flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                      {error}
                    </p>
                    <button onClick={handleRetry} className="bg-white dark:bg-[#00212e] px-3 py-1 rounded-lg text-xs font-bold border border-[#ff4757]/30 hover:bg-[#fff1f2] dark:hover:bg-[#ff4757]/40 transition-colors">Retry</button>
                  </div>
                )}

                <div className="dashboard-row dashboard-row-main min-h-0">
                  <div className="min-h-0 overflow-hidden">
                    <AlertsChartWidget data={alertData} onOpenHistory={openHistory} isDark={isDark} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <AlertHistoryModal show={showHistory} onClose={() => setShowHistory(false)} historyWeeks={historyWeeks} historyLoading={historyLoading} calendarMonth={calendarMonth} setCalendarMonth={setCalendarMonth} calendarGrid={calendarGrid} hoveredRow={hoveredRow} setHoveredRow={setHoveredRow} onOpenWeekDetail={openWeekDetail} />
      <WeekDetailModal selectedWeek={selectedWeek} selectedWeekData={selectedWeekData} selectedWeekLoading={selectedWeekLoading} onClose={closeWeekDetail} isDark={isDark} />
    </>
  );
};

export default AdminDashboard;