import axiosInstance from '../api/axiosInstance';

export const fetchAdminProfile = async (adminId) => {
  const { data } = await axiosInstance.get(`/admin/${adminId}`);
  return data;
};

export const fetchNurseProfile = async (nurseId) => {
  const { data } = await axiosInstance.get(`/nurses/${nurseId}`);
  return data;
};

export const fetchLinkedNurseProfile = async (adminId) => {
  const { data } = await axiosInstance.get(`/nurses/linked-profile/${adminId}`);
  return data;
};

export const saveAdminProfile = async (adminId, payload) => {
  const { data } = await axiosInstance.put(`/admin/${adminId}/profile`, payload);
  return data;
};

export const saveNurseProfile = async (nurseId, payload) => {
  const { data } = await axiosInstance.put(`/nurses/${nurseId}/profile`, payload);
  return data;
};

export const changeAdminPassword = async (adminId, oldPassword, newPassword) => {
  const { data } = await axiosInstance.put(`/admin/${adminId}/change-password`, {
    oldPassword,
    newPassword,
  });
  return data;
};

export const changeNursePassword = async (nurseId, oldPassword, newPassword) => {
  const { data } = await axiosInstance.put(`/nurses/${nurseId}/change-password`, {
    oldPassword,
    newPassword,
  });
  return data;
};

export const toggle2FA = async (adminId, enable, pin) => {
  const { data } = await axiosInstance.post(`/admin/${adminId}/toggle-2fa`, { enable, pin });
  return data;
};

export const toggleNurse2FA = async (nurseId, enable, pin) => {
  const { data } = await axiosInstance.post(`/nurses/${nurseId}/toggle-2fa`, { enable, pin });
  return data;
};

export const linkNurseAccount = async (adminId, nurseId) => {
  const { data } = await axiosInstance.post(`/admin/${adminId}/link-nurse`, { nurseId });
  return data;
};

export const unlinkNurseAccount = async (adminId) => {
  const { data } = await axiosInstance.post(`/admin/${adminId}/unlink-nurse`);
  return data;
};

export const deactivateAccount = async (adminId) => {
  const { data } = await axiosInstance.put(`/admin/${adminId}/deactivate`);
  return data;
};

export const fetchArchiveStatus = async () => {
  const { data } = await axiosInstance.get('/audit-archive/status');
  return data;
};

export const triggerAuditArchive = async () => {
  const { data } = await axiosInstance.post('/audit-archive/trigger');
  return data;
};