import axiosInstance from '../api/axiosInstance';

export const fetchAllResidents = async () => {
  const { data } = await axiosInstance.get('/residents/all');
  return data;
};

export const fetchResidentsByNurse = async (nurseId) => {
  const { data } = await axiosInstance.get(`/residents/nurse/${nurseId}`);
  return data;
};

export const fetchAssessments = async (residentId) => {
  const { data } = await axiosInstance.get(`/assessments/resident/${residentId}`);
  return data;
};

export const createAssessment = async (payload) => {
  const { data } = await axiosInstance.post('/assessments/add', payload);
  return data;
};

export const updateAssessment = async (id, payload) => {
  const { data } = await axiosInstance.put(`/assessments/${id}`, payload);
  return data;
};

export const deleteAssessment = async (id) => {
  await axiosInstance.delete(`/assessments/${id}`);
};

export const postComment = async (assessmentId, payload) => {
  const { data } = await axiosInstance.post(`/assessments/${assessmentId}/comments`, payload);
  return data;
};

export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await axiosInstance.post('/assessments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};