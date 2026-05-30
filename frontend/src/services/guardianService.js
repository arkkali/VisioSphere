    import axiosInstance from '../api/axiosInstance';

export const fetchAllGuardians = async () => {
  const response = await axiosInstance.get('/guardians/all');
  return response.data;
};

export const fetchAllResidents = async () => {
  const response = await axiosInstance.get('/residents/all');
  return response.data;
};

export const addGuardian = async (data) => {
  const response = await axiosInstance.post('/guardians/add', data);
  return response.data.guardian || response.data;
};

export const updateGuardian = async (guardianId, data) => {
  const response = await axiosInstance.put(`/guardians/${guardianId}`, data);
  return response.data.guardian || response.data;
};

export const deleteGuardian = async (guardianId) => {
  await axiosInstance.delete(`/guardians/${guardianId}`);
};

export const linkElder = async (guardianId, residentId) => {
  const response = await axiosInstance.put('/guardians/link-elder', { guardianId, residentId });
  return response.data.guardian;
};

export const unlinkElder = async (guardianId, residentId) => {
  const response = await axiosInstance.put('/guardians/unlink-elder', { guardianId, residentId });
  return response.data.guardian;
};