import axiosInstance from '../api/axiosInstance';

export const getAllResidents = async () => {
  const res = await axiosInstance.get('/residents/all');
  return res.data;
};

export const updateResident = async (id, data) => {
  const res = await axiosInstance.put(`/residents/${id}`, data);
  return res.data.resident;
};

export const deleteResident = async (id) => {
  await axiosInstance.delete(`/residents/${id}`);
};

export const addResident = async (data) => {
  const res = await axiosInstance.post('/residents/add', data);
  return res.data.resident;
};

export const importResidents = async (formData) => {
  const res = await axiosInstance.post('/residents/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data.rows;
};

export const batchImportResidents = async (residents) => {
  const res = await axiosInstance.post('/residents/batch', { residents });
  return res.data.residents;
};

export const saveReport = async (reportData) => {
  await axiosInstance.post('/reports/save', reportData);
};

export const getArchivedReports = async () => {
  const res = await axiosInstance.get('/reports/all');
  return res.data;
};