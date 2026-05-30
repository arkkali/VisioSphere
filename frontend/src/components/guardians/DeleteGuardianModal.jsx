import React from 'react';

const getFullName = (person) => {
  if (!person) return '';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const DeleteGuardianModal = ({ deleteTargetIds, guardians, onCancel, onConfirm }) => {
  const singleTarget = deleteTargetIds.size === 1
    ? guardians.find((g) => deleteTargetIds.has(g.guardianId))
    : null;

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] p-[20px] backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl w-[90%] max-w-[450px] overflow-hidden animate-[modalPop_0.2s_ease-out] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center p-[32px_24px_24px_24px] border-b border-[#fde8e8] dark:border-rose-900/30 bg-[#fff5f5] dark:bg-rose-950/20 gap-[16px]">
          <div className="w-[64px] h-[64px] bg-white dark:bg-slate-800 rounded-full flex items-center justify-center border-[3px] border-[#fecdd3] dark:border-rose-900/50 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[32px] h-[32px] text-[#e11d48] dark:text-rose-500">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
          </div>
          <h2 className="text-[#e11d48] dark:text-rose-400 text-[1.5rem] m-0 font-extrabold">Confirm Deletion</h2>
        </div>

        <div className="p-[24px]">
          <p className="text-[#2E3A59] dark:text-slate-300 text-[1rem] leading-[1.6] m-0 text-center font-medium">
            Are you absolutely sure you want to delete{' '}
            <strong className="text-[#00212e] dark:text-white">
              {singleTarget ? getFullName(singleTarget) : `${deleteTargetIds.size} accounts`}
            </strong>
            ? This action cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
          <button
            className="flex-1 p-[12px_24px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="flex-1 p-[12px_28px] bg-gradient-to-br from-[#e11d48] to-[#be123c] dark:from-rose-600 dark:to-rose-800 border-none text-white rounded-[8px] font-bold shadow-[0_4px_12px_rgba(225,29,72,0.25)] hover:-translate-y-[2px] transition-all"
            onClick={onConfirm}
          >
            Yes, Delete
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteGuardianModal;