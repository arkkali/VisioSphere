import React from 'react';

const GuardianFilters = ({ searchTerm, onSearchChange, sortOrder, onSortChange, statusFilter, onStatusChange }) => {
  return (
    <div className="flex flex-col xl:flex-row gap-[16px] mb-[24px] items-center">
      <div className="flex-1 w-full flex items-center gap-[12px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[8px] p-[10px_16px] focus-within:border-[#00a8e8] dark:focus-within:border-[#38bdf8] focus-within:shadow-[0_0_0_3px_rgba(0,168,232,0.1)] transition-all">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px] text-[#94a3b8] dark:text-slate-500">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input
          type="text"
          placeholder="Search by Guardian ID, Name, or Email..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 border-none outline-none text-[0.95rem] font-medium text-[#00212e] dark:text-white bg-transparent placeholder:text-[#94a3b8] dark:placeholder:text-slate-500"
        />
      </div>
      <div className="flex gap-[8px] overflow-x-auto w-full xl:w-auto pb-[4px] xl:pb-0">
        <button
          className={`px-[16px] py-[10px] rounded-[6px] font-bold text-[0.85rem] border transition-colors whitespace-nowrap ${sortOrder === 'asc' ? 'bg-[#f1f5f9] dark:bg-slate-700 border-[#cbd5e1] dark:border-slate-500 text-[#00212e] dark:text-white' : 'bg-white dark:bg-slate-800 border-[#cbd5e1] dark:border-slate-600 text-[#64748b] dark:text-slate-400 hover:bg-[#f8fafc] dark:hover:bg-slate-700'}`}
          onClick={() => onSortChange(sortOrder === 'asc' ? 'default' : 'asc')}
        >
          A-Z ↓
        </button>
        <button
          className={`px-[16px] py-[10px] rounded-[6px] font-bold text-[0.85rem] border transition-colors whitespace-nowrap ${sortOrder === 'desc' ? 'bg-[#f1f5f9] dark:bg-slate-700 border-[#cbd5e1] dark:border-slate-500 text-[#00212e] dark:text-white' : 'bg-white dark:bg-slate-800 border-[#cbd5e1] dark:border-slate-600 text-[#64748b] dark:text-slate-400 hover:bg-[#f8fafc] dark:hover:bg-slate-700'}`}
          onClick={() => onSortChange(sortOrder === 'desc' ? 'default' : 'desc')}
        >
          Z-A ↑
        </button>
        <div className="w-[1px] bg-[#e2e8f0] dark:bg-slate-700 mx-[4px]"></div>
        {['ALL', 'ACTIVE', 'INACTIVE', 'PENDING'].map((status) => (
          <button
            key={status}
            className={`px-[16px] py-[10px] rounded-[6px] font-bold text-[0.85rem] border transition-colors whitespace-nowrap ${statusFilter === status ? 'bg-[#00a8e8] dark:bg-[#0284c7] border-[#00a8e8] dark:border-[#0284c7] text-white shadow-sm' : 'bg-white dark:bg-slate-800 border-[#cbd5e1] dark:border-slate-600 text-[#64748b] dark:text-slate-400 hover:bg-[#f8fafc] dark:hover:bg-slate-700'}`}
            onClick={() => onStatusChange(status)}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GuardianFilters;