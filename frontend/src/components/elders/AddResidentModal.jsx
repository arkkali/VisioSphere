import React from 'react';
import { housesForCurrentUser } from '../../constants/houses';

const AddResidentModal = ({ newResident, setNewResident, onSave, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease] backdrop-blur-[3px] p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl w-[90%] max-w-[500px] max-h-[90vh] overflow-y-auto animate-[slideUp_0.28s_ease] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-[24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[14px]">
          <h2 className="m-0 text-[1.4rem] text-[#00212e] dark:text-white font-extrabold">Add New Resident</h2>
          <button
            className="bg-transparent border-none w-[34px] h-[34px] flex items-center justify-center cursor-pointer rounded-[7px] transition-all text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-slate-700 hover:text-[#d32f2f] dark:hover:text-rose-400"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-[32px] flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[8px]">
            <label className="font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">First Name *</label>
            <input
              type="text"
              placeholder="Enter legal first name"
              value={newResident.firstName}
              onChange={(e) => setNewResident({ ...newResident, firstName: e.target.value })}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-bold text-[#00212e] dark:text-white placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.5px]">Middle Name (Optional)</label>
            <input
              type="text"
              placeholder="Optional"
              value={newResident.middleName}
              onChange={(e) => setNewResident({ ...newResident, middleName: e.target.value })}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-bold text-[#00212e] dark:text-white placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.4px]">Last Name *</label>
            <input
              type="text"
              placeholder="Enter legal last name"
              value={newResident.lastName}
              onChange={(e) => setNewResident({ ...newResident, lastName: e.target.value })}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-bold text-[#00212e] dark:text-white placeholder:text-[#94a3b8] dark:placeholder:text-slate-500 focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
            />
          </div>

          <div className="flex flex-col gap-[8px]">
            <label className="font-bold text-[#2E3A59] dark:text-slate-300 text-[0.85rem] uppercase tracking-[0.4px]">House Assignment *</label>
            <select
              value={newResident.house}
              onChange={(e) => setNewResident({ ...newResident, house: e.target.value })}
              className="w-full p-[14px] bg-white dark:bg-slate-900 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[0.95rem] font-bold text-[#00212e] dark:text-white focus:outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300a8e8%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2338bdf8%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]"
            >
              {housesForCurrentUser().map((house) => (
                <option key={house} value={house}>{house}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[14px]">
          <button
            className="p-[12px_24px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="p-[12px_28px] border-none bg-gradient-to-br from-[#00a8e8] to-[#0075a2] dark:from-[#0284c7] dark:to-[#0369a1] text-white rounded-[8px] font-bold shadow-[0_4px_12px_rgba(0,168,232,0.25)] hover:-translate-y-[2px] transition-all"
            onClick={onSave}
          >
            Save Resident
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddResidentModal;