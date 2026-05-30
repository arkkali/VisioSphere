import React from 'react';

const getFullName = (person) => {
  if (!person) return 'Unknown';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const DeleteNurseModal = ({ show, onClose, onConfirm, deleteTargetIds, nurses }) => {
  if (!show) return null;

  const targetName =
    deleteTargetIds.size === 1
      ? getFullName(nurses.find((n) => deleteTargetIds.has(n.nurseId)))
      : `${deleteTargetIds.size} medical accounts`;

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[16px] shadow-2xl max-w-[450px] w-full animate-[slideUp_0.3s_ease-out] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-[16px] p-[32px_32px_24px] border-b border-[#E5E7EB] dark:border-slate-700 text-center">
          <div className="w-[64px] h-[64px] bg-[#fff1f2] dark:bg-rose-950/30 rounded-full flex items-center justify-center shadow-inner">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[32px] h-[32px] text-[#e11d48] dark:text-rose-500">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
            </svg>
          </div>
          <h2 className="m-0 text-[1.6rem] text-[#00212e] dark:text-white font-extrabold">Confirm Deletion</h2>
        </div>

        <div className="p-[24px_32px]">
          <p className="m-0 text-[#2E3A59] dark:text-slate-300 leading-[1.6] text-[1rem] text-center font-medium">
            Are you absolutely sure you want to delete{' '}
            <strong className="text-[#00212e] dark:text-white">{targetName}</strong>? This action cannot be undone and will revoke system access.
          </p>
        </div>

        <div className="flex justify-end gap-[16px] p-[24px] border-t border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 rounded-b-[16px]">
          <button
            className="flex-1 p-[12px_24px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 text-[#2E3A59] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="flex-1 p-[12px_24px] border-none bg-[#e11d48] dark:bg-rose-600 text-white rounded-[8px] font-bold hover:bg-[#be123c] dark:hover:bg-rose-700 hover:shadow-md hover:-translate-y-[1px] transition-all"
            onClick={onConfirm}
          >
            Yes, Revoke
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteNurseModal;