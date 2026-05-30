const SELECT_CLASS = "p-[12px] border border-[#cbd5e1] dark:border-slate-700 rounded-[8px] bg-white dark:bg-slate-900 text-[#00212e] dark:text-white font-bold text-[0.9rem] cursor-pointer outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_14px_center]";
const LABEL_CLASS = "text-[0.8rem] font-extrabold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]";

const AuditFiltersBar = ({
  searchQuery, setSearchQuery,
  filterCategory, setFilterCategory,
  filterStatus, setFilterStatus,
  dateFilter, setDateFilter,
  categories,
  onClear,
  onExport,
  onPageReset,
}) => {
  const statuses = ['All', 'success', 'alert', 'failed'];

  return (
    <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] p-[24px] mb-[30px] shadow-sm transition-colors duration-300">
      <div className="mb-[20px] flex items-center bg-[#f8fafc] dark:bg-slate-900 border border-[#cbd5e1] dark:border-slate-700 rounded-[8px] px-[16px] focus-within:border-[#00a8e8] dark:focus-within:border-[#00a8e8] focus-within:shadow-[0_0_0_3px_rgba(0,168,232,0.1)] transition-all">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px] text-[#94a3b8] dark:text-slate-500 shrink-0">
          <circle cx="11" cy="11" r="8"></circle>
          <path d="m21 21-4.35-4.35"></path>
        </svg>
        <input
          type="text"
          placeholder="Search logs by event, actor, or details..."
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); onPageReset(); }}
          className="w-full p-[12px] bg-transparent border-none text-[0.95rem] font-medium text-[#00212e] dark:text-white outline-none placeholder:text-[#94a3b8] dark:placeholder:text-slate-500"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-[16px] items-end">
        <div className="flex flex-col gap-[8px]">
          <label className={LABEL_CLASS}>Category</label>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); onPageReset(); }}
            className={SELECT_CLASS}
          >
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[8px]">
          <label className={LABEL_CLASS}>Status</label>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); onPageReset(); }}
            className={SELECT_CLASS}
          >
            {statuses.map(status => (
              <option key={status} value={status}>
                {status === 'All' ? 'All Status' : status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-[8px]">
          <label className={LABEL_CLASS}>Date Range</label>
          <select
            value={dateFilter}
            onChange={(e) => { setDateFilter(e.target.value); onPageReset(); }}
            className={SELECT_CLASS}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
          </select>
        </div>

        <div className="flex flex-row items-center gap-[12px] h-[45px]">
          <button
            className="px-[16px] h-full bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[#475569] dark:text-slate-300 font-bold cursor-pointer transition-all duration-200 hover:bg-[#f8fafc] dark:hover:bg-slate-700 hover:text-[#00212e] dark:hover:text-white"
            onClick={onClear}
          >
            Clear Filters
          </button>
          <button
            className="px-[20px] h-full bg-[#00a8e8] text-white border-none rounded-[8px] font-bold cursor-pointer transition-all duration-200 shadow-[0_4px_12px_rgba(0,168,232,0.25)] hover:bg-[#0088b8] dark:hover:bg-[#0369a1] hover:-translate-y-[2px]"
            onClick={onExport}
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditFiltersBar;