import React from 'react';

const EditGuardianModal = ({ editGuardian, onChange, onNameInput, onPhoneInput, onClose, onSubmit }) => {
  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] p-[20px] backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl max-w-[500px] w-full flex flex-col animate-[modalPop_0.2s_ease-out] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-[24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[14px]">
          <h2 className="text-[1.5rem] font-extrabold text-[#00212e] dark:text-white m-0">Edit Guardian Account</h2>
          <p className="text-[#64748b] dark:text-slate-400 text-[0.9rem] m-0 mt-[4px] font-medium">Update profile and status.</p>
        </div>

        <div className="p-[32px] overflow-y-auto max-h-[70vh] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">First Name *</label>
            <input
              type="text"
              value={editGuardian.firstName}
              onChange={(e) => onNameInput('firstName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Middle Name</label>
            <input
              type="text"
              value={editGuardian.middleName}
              onChange={(e) => onNameInput('middleName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Last Name *</label>
            <input
              type="text"
              value={editGuardian.lastName}
              onChange={(e) => onNameInput('lastName', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Contact Email *</label>
            <input
              type="email"
              value={editGuardian.email}
              onChange={(e) => onChange('email', e.target.value)}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-[16px]">
            <div className="flex flex-col gap-[8px]">
              <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Phone</label>
              <input
                type="tel"
                placeholder="09xxxxxxxxx"
                maxLength="11"
                value={editGuardian.phone}
                onChange={(e) => onPhoneInput('phone', e.target.value)}
                className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
              />
            </div>
            <div className="flex flex-col gap-[8px]">
              <label className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Account Status</label>
              <select
                value={editGuardian.status}
                onChange={(e) => onChange('status', e.target.value)}
                className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[#00212e] dark:text-white text-[0.95rem] outline-none cursor-pointer focus:border-[#00a8e8] dark:focus:border-[#38bdf8] appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
                <option value="PENDING">PENDING</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[14px] flex justify-end gap-[12px]">
          <button
            className="p-[12px_24px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 font-bold text-[0.9rem] rounded-[8px] hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="p-[12px_28px] bg-[#00435c] dark:bg-[#0284c7] border-none text-white font-bold text-[0.9rem] rounded-[8px] shadow-[0_4px_12px_rgba(0,168,232,0.25)] hover:bg-[#00212e] dark:hover:bg-[#0369a1] hover:-translate-y-[1px] transition-all"
            onClick={onSubmit}
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditGuardianModal;