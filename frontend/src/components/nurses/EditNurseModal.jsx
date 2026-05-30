import React from 'react';

const HOUSES = [
  'House of St. Charbel',
  'House of St. Francis',
  'House of St. Gabriel',
  'House of St. Rose of Lima',
  'House of St. Sebastian',
  'Louis S. Coson Hall',
];

const EditNurseModal = ({ show, onClose, nurse, onChange, onSubmit, isSubmitting }) => {
  if (!show) return null;

  const handleNameInput = (field, value) => {
    onChange(field, value.replace(/[^a-zA-Z\s]/g, ''));
  };

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-[20px] animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl max-w-[500px] w-full max-h-[90vh] overflow-y-auto animate-[slideUp_0.3s_ease-out] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-[24px] border-b border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 rounded-t-[16px]">
          <h2 className="m-0 text-[1.5rem] text-[#00212e] dark:text-white font-extrabold">Edit Profile</h2>
          <p className="text-[#4A4A4A] dark:text-slate-400 text-[0.9rem] m-0 mt-[4px] font-medium">Update administrative details for {nurse.nurseId}.</p>
        </div>

        <div className="p-[32px]">
          <div className="mb-[20px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">First Name *</label>
            <input
              type="text"
              value={nurse.firstName}
              onChange={(e) => handleNameInput('firstName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all"
            />
          </div>

          <div className="mb-[20px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">Middle Name</label>
            <input
              type="text"
              value={nurse.middleName}
              onChange={(e) => handleNameInput('middleName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all"
            />
          </div>

          <div className="mb-[20px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">Last Name *</label>
            <input
              type="text"
              value={nurse.lastName}
              onChange={(e) => handleNameInput('lastName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all"
            />
          </div>

          <div className="mb-[20px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">Email Address *</label>
            <input
              type="email"
              value={nurse.email}
              onChange={(e) => onChange('email', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all"
            />
          </div>

          <div className="mb-[20px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">House Assignment *</label>
            <select
              value={nurse.houseAssigned}
              onChange={(e) => onChange('houseAssigned', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
            >
              {HOUSES.map((house) => (
                <option key={house} value={house}>{house}</option>
              ))}
            </select>
          </div>

          <div className="mb-[10px]">
            <label className="block mb-[8px] font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">Account Status *</label>
            <select
              value={nurse.status}
              onChange={(e) => onChange('status', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-medium text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:ring-[3px] focus:ring-[#00a8e8]/20 transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="On Leave">On Leave</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-[16px] p-[24px] border-t border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 rounded-b-[16px]">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-[12px_24px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 text-[#2E3A59] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={isSubmitting}
            className="p-[12px_32px] border-none bg-[#00435c] dark:bg-[#0284c7] text-white rounded-[8px] font-bold hover:bg-[#00212e] dark:hover:bg-[#0369a1] hover:shadow-md hover:-translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditNurseModal;