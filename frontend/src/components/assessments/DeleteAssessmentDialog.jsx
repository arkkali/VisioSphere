import React, { useState } from 'react';

const DeleteAssessmentDialog = ({ assessment, onConfirm, onCancel }) => {
  const [deleting, setDeleting] = useState(false);

  if (!assessment) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await onConfirm(assessment._id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease] backdrop-blur-[3px] p-[20px]"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl w-[90%] max-w-[450px] overflow-hidden animate-[slideUp_0.28s_ease] transition-colors duration-300"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center p-[32px_24px_24px_24px] border-b border-[#fde8e8] dark:border-rose-900/30 bg-[#fff5f5] dark:bg-rose-950/20 rounded-t-[14px] gap-[16px]">
          <div className="w-[64px] h-[64px] bg-white dark:bg-slate-800 rounded-full flex items-center justify-center border-[3px] border-[#fecdd3] dark:border-rose-900/50 shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[32px] h-[32px] text-[#e11d48] dark:text-rose-500">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </div>
          <h2 className="text-[#e11d48] dark:text-rose-400 text-[1.5rem] m-0 font-extrabold">Confirm Deletion</h2>
        </div>

        <div className="p-[24px]">
          <p className="text-[#2E3A59] dark:text-slate-300 text-[1rem] leading-[1.6] m-0 text-center font-medium">
            Are you absolutely sure you want to delete this assessment? This action cannot be undone.
          </p>
          {assessment.title && (
            <p className="text-[#64748b] dark:text-slate-400 text-[0.9rem] leading-[1.5] mt-[12px] mb-0 text-center font-semibold">
              {assessment.title}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[14px]">
          <button
            className="flex-1 p-[12px_24px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            className="flex-1 p-[12px_28px] border-none bg-gradient-to-br from-[#e11d48] to-[#be123c] dark:from-rose-600 dark:to-rose-800 text-white rounded-[8px] font-bold shadow-[0_4px_12px_rgba(225,29,72,0.25)] hover:-translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Yes, Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteAssessmentDialog;