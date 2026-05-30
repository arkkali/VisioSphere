import React from 'react';

const BulkActionBar = ({
  selectedCount,
  bulkAttendanceValue,
  setBulkAttendanceValue,
  onApply,
  onEdit,
  onDelete,
  onClear,
  isNurseView,
  showEdit,
}) => {
  return (
    <div className="bg-[#e1f5fe] dark:bg-[#0284c7]/20 border border-[#00a8e8] dark:border-[#38bdf8] rounded-[10px] p-[14px_18px] mb-[20px] flex justify-between items-center gap-[16px] animate-[slideDown_0.3s_ease] flex-wrap shadow-sm">
      <span className="font-extrabold text-[#00435c] dark:text-[#38bdf8] text-[0.95rem] min-w-[150px] flex items-center gap-[8px] before:content-[''] before:inline-block before:w-[8px] before:h-[8px] before:rounded-full before:bg-[#00a8e8] dark:before:bg-[#38bdf8] before:shrink-0">
        {selectedCount} resident(s) selected
      </span>
      <div className="flex gap-[10px] items-center flex-wrap flex-1">
        <select
          value={bulkAttendanceValue}
          onChange={(e) => setBulkAttendanceValue(e.target.value)}
          className="p-[10px_34px_10px_14px] bg-white dark:bg-slate-800 border-[1.5px] border-[#00a8e8] dark:border-[#38bdf8] rounded-[6px] text-[#00212e] dark:text-white font-bold text-[0.85rem] cursor-pointer transition-all duration-200 outline-none shadow-sm"
        >
          <option value="" disabled hidden>Select Status</option>
          <option value="Present">Mark as Present</option>
          <option value="Not Present">Mark as Not Present</option>
        </select>
        <button
          className="p-[9px_18px] border-none rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap bg-[#10b981] dark:bg-emerald-600 text-white shadow-md hover:bg-[#059669] dark:hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={onApply}
          disabled={!bulkAttendanceValue}
        >
          Apply to Selected
        </button>

        {showEdit && (
          <button
            className="p-[9px_16px] border-[1.5px] bg-white dark:bg-slate-800 rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap text-[#00a8e8] dark:text-[#38bdf8] border-[#00a8e8] dark:border-[#38bdf8] hover:bg-[#e1f5fe] dark:hover:bg-slate-700"
            onClick={onEdit}
          >
            Edit
          </button>
        )}

        {!isNurseView && (
          <button
            className="p-[9px_16px] border-[1.5px] bg-[#fff1f2] dark:bg-rose-950/30 rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap text-[#e11d48] dark:text-rose-400 border-[#fda4af] dark:border-rose-900/50 hover:bg-[#ffe4e6] dark:hover:bg-rose-900/50"
            onClick={onDelete}
          >
            Delete {selectedCount > 1 ? `(${selectedCount})` : ''}
          </button>
        )}

        <button
          className="p-[9px_18px] border border-[#cbd5e1] dark:border-slate-600 rounded-[6px] font-bold text-[0.85rem] cursor-pointer transition-all duration-200 whitespace-nowrap bg-white dark:bg-slate-800 text-[#64748b] dark:text-slate-300 hover:bg-[#f1f5f9] dark:hover:bg-slate-700"
          onClick={onClear}
        >
          Clear Selection
        </button>
      </div>
    </div>
  );
};

export default BulkActionBar;