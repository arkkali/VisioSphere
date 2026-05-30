import axiosInstance from '../api/axiosInstance';

const dashboardService = {
  getStats: async () => {
    const response = await axiosInstance.get('/admin/stats');
    return response.data;
  },

  getRecentLogs: async (limit = 4) => {
    const response = await axiosInstance.get('/audit-logs');
    return response.data.slice(0, limit);
  },

  getStatsComparison: async () => {
    const fallbackStat = { current: 0, diff: 0, direction: 'neutral', label: 'No changes since last month' };
    const fallbackAlert = { current: 0, diff: 0, direction: 'neutral', label: 'No changes since yesterday' };

    const [residentsRes, nursesRes, alertsRes] = await Promise.allSettled([
      axiosInstance.get('/residents/stats/comparison'),
      axiosInstance.get('/nurses/stats/comparison'),
      axiosInstance.get(`/incidents/stats/daily?_=${Date.now()}`),
    ]);

    const r = residentsRes.status === 'fulfilled' ? residentsRes.value.data : fallbackStat;
    const n = nursesRes.status === 'fulfilled' ? nursesRes.value.data : fallbackStat;
    const a = alertsRes.status === 'fulfilled' ? alertsRes.value.data : fallbackAlert;

    return {
      elders: {
        current:   r.current   ?? 0,
        diff:      r.diff      ?? 0,
        direction: r.direction ?? 'neutral',
        label:     r.label     ?? 'No changes since last month',
      },
      nurses: {
        current:   n.current   ?? 0,
        diff:      n.diff      ?? 0,
        direction: n.direction ?? 'neutral',
        label:     n.label     ?? 'No changes since last month',
      },
      alerts: {
        current:   a.current   ?? 0,
        diff:      a.diff      ?? 0,
        direction: a.direction ?? 'neutral',
        label:     a.label     ?? 'No changes since yesterday',
      },
    };
  },

  getRecentIncidents: async () => {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const response = await axiosInstance.get(
      `/incidents?since=${encodeURIComponent(since24h)}&limit=50`
    );
    return Array.isArray(response.data.items) ? response.data.items : [];
  },

  getUnreadCount: async () => {
    const response = await axiosInstance.get('/incidents/unread-count');
    return response.data.count || 0;
  },

  getWeeklyStats: async (weekStart, tz) => {
    const safeTz = (() => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return tz;
      } catch {
        return 'UTC';
      }
    })();

    const response = await axiosInstance.get(
      `/incidents/stats/weekly?weekStart=${weekStart}&tz=${encodeURIComponent(safeTz)}`
    );
    return Array.isArray(response.data) ? response.data : [];
  },

  acknowledgeIncidents: async (ids, userId) => {
    await Promise.all(
      ids.map((id) => axiosInstance.patch(`/incidents/${id}/acknowledge`, { userId }))
    );
  },
};

export default dashboardService;