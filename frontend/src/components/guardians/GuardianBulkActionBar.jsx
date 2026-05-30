import React from 'react';

const GuardianBulkActionBar = ({ selectedCount, onEdit, onDelete, onClear, isNurseView }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-[#e1f5fe] dark:bg-[#0284c7]/20 border border-[#00a8e8] dark:border-[#38bdf8] rounded-[8px] p-[12px_20px] mb-[24px] flex justify-between items-center gap-[16px] animate-[fadeIn_0.2s_ease] flex-wrap shadow-sm">
      <span className="font-bold text-[#00435c] dark:text-[#38bdf8] text-[0.95rem] flex items-center gap-[8px]">
        <span className="w-[8px] h-[8px] bg-[#00a8e8] dark:bg-[#38bdf8] rounded-full inline-block"></span>
        {selectedCount} account(s) selected
      </span>
      <div className="flex gap-[12px] items-center flex-wrap">
        {selectedCount === 1 && (
          <button
            className="p-[8px_16px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[6px] font-bold text-[0.85rem] text-[#475569] dark:text-slate-300 cursor-pointer transition-colors hover:bg-[#f8fafc] dark:hover:bg-slate-700 hover:border-[#94a3b8] dark:hover:border-slate-500"
            onClick={onEdit}
          >
            Edit Account
          </button>
        )}
        {!isNurseView && (
          <button
            className="p-[8px_16px] bg-[#fff1f2] dark:bg-rose-950/30 border border-[#fda4af] dark:border-rose-900/50 rounded-[6px] font-bold text-[0.85rem] text-[#e11d48] dark:text-rose-400 cursor-pointer transition-colors hover:bg-[#ffe4e6] dark:hover:bg-rose-900/50"
            onClick={onDelete}
          >
            Delete
          </button>
        )}
        <button
          className="p-[8px_16px] bg-transparent border-none text-[#64748b] dark:text-slate-400 font-bold text-[0.85rem] cursor-pointer hover:text-[#00212e] dark:hover:text-white"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default GuardianBulkActionBar;