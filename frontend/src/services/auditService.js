import axiosInstance from '../api/axiosInstance';

const buildActor = () => {
  const rawName = localStorage.getItem('userName') || '';
  const rawRole = localStorage.getItem('userRole') || '';

  const actorName = rawName.trim() || 'Unknown';
  const actorRole = rawRole.trim() || 'Facility Admin';

  return { actorName, actorRole };
};

export const fetchAuditLogs = async () => {
  const { data } = await axiosInstance.get('/audit-logs');
  return data;
};

export const logAudit = async (payload) => {
  const actor = buildActor();
  await axiosInstance.post('/audit-logs', {
    ...payload,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    actorId: localStorage.getItem('userId') || null,
  });
};