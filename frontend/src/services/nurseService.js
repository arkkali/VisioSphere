import axiosInstance from '../api/axiosInstance';

const nurseService = {
  getAllNurses: async () => {
    const res = await axiosInstance.get('/nurses/all');
    return res.data;
  },

  addNurse: async (data) => {
    const res = await axiosInstance.post('/nurses/add', data);
    return res.data.nurse;
  },

  updateNurse: async (nurseId, data) => {
    const res = await axiosInstance.put(`/nurses/${nurseId}`, data);
    return res.data.nurse;
  },

  updateNurseStatus: async (nurseId, status) => {
    const res = await axiosInstance.put(`/nurses/${nurseId}`, { status });
    return res.data.nurse;
  },

  deleteNurse: async (nurseId) => {
    await axiosInstance.delete(`/nurses/${nurseId}`);
  },

  assignElder: async (nurseId, elderId) => {
    await axiosInstance.put(`/nurses/${nurseId}/assign-elder`, { elderId });
  },

  unassignElder: async (nurseId, elderId) => {
    await axiosInstance.put(`/nurses/${nurseId}/unassign-elder`, { elderId });
  },

  getAllResidents: async () => {
    const res = await axiosInstance.get('/residents/all');
    return res.data;
  },
};

export default nurseService;