import React from 'react';

const ResolveConfirmModal = ({ show, onClose, onConfirm, incident, isSubmitting }) => {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[1000] p-[20px] animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl max-w-[440px] w-full animate-[slideUp_0.3s_ease-out] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-[24px] border-b border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 rounded-t-[14px]">
          <h2 className="m-0 text-[1.3rem] text-[#00212e] dark:text-white font-extrabold">Confirm Resolution</h2>
          <p className="text-[#4A4A4A] dark:text-slate-400 text-[0.9rem] m-0 mt-[4px] font-medium">
            Has this incident been resolved?
          </p>
        </div>

        <div className="p-[28px]">
          <div className="bg-[#F8FAFC] dark:bg-slate-900/50 border border-[#E5E7EB] dark:border-slate-700 rounded-[10px] p-[16px] flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px]">
              <span className="text-[0.75rem] font-bold uppercase tracking-[0.5px] text-[#2E3A59] dark:text-slate-400">
                Type
              </span>
              <span className="text-[0.9rem] font-semibold text-[#00212e] dark:text-white">
                {incident?.incidentType || '—'}
              </span>
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="text-[0.75rem] font-bold uppercase tracking-[0.5px] text-[#2E3A59] dark:text-slate-400">
                Location
              </span>
              <span className="text-[0.9rem] font-semibold text-[#00212e] dark:text-white">
                {incident?.location || '—'}
              </span>
            </div>
            <div className="flex items-center gap-[8px]">
              <span className="text-[0.75rem] font-bold uppercase tracking-[0.5px] text-[#2E3A59] dark:text-slate-400">
                Severity
              </span>
              <span className={`text-[0.85rem] font-bold px-[8px] py-[2px] rounded-full ${
                incident?.severity === 'Emergency'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400'
              }`}>
                {incident?.severity || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-[16px] p-[24px] border-t border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 rounded-b-[14px]">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-[12px_24px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 text-[#2E3A59] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#F8FAFC] dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="p-[12px_32px] border-none bg-emerald-600 dark:bg-emerald-700 text-white rounded-[8px] font-bold hover:bg-emerald-700 dark:hover:bg-emerald-800 hover:shadow-md hover:-translate-y-[1px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Resolving...' : 'Yes, Resolved'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResolveConfirmModal;