import axiosInstance from '../api/axiosInstance';

export const fetchRecentIncidents = async (since, limit = 100) => {
  const { data } = await axiosInstance.get('/incidents', {
    params: { since, limit },
  });
  return Array.isArray(data.items) ? data.items : [];
};

export const dismissIncident = async (id, userId) => {
  await axiosInstance.patch(`/incidents/${id}/dismiss`, { userId });
};

export const acknowledgeIncident = async (id, userId) => {
  await axiosInstance.patch(`/incidents/${id}/acknowledge`, { userId });
};

export const resolveIncident = async (id, userId) => {
  const { data } = await axiosInstance.patch(`/incidents/${id}/resolve`, { userId });
  return data;
};