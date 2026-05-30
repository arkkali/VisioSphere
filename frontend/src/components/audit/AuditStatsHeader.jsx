const AuditStatsHeader = ({ logs }) => {
  const todayCount = logs.filter(
    log => new Date(log.createdAt).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="flex flex-col lg:flex-row justify-between lg:items-center mb-[30px] p-[24px] bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] shadow-sm gap-[16px] lg:gap-0 transition-colors duration-300">
      <div className="flex flex-col">
        <h1 className="text-[1.8rem] lg:text-[2.2rem] text-[#00212e] dark:text-white m-[0_0_4px_0] font-extrabold tracking-[-0.5px]">Audit Trail & Logs</h1>
        <p className="text-[0.95rem] text-[#64748b] dark:text-slate-400 m-0 font-medium">Real-time activity monitoring and compliance tracking</p>
      </div>
      <div className="flex flex-row justify-around lg:justify-end gap-[30px] w-full lg:w-auto">
        <div className="flex flex-col items-center">
          <span className="text-[0.75rem] text-[#94a3b8] dark:text-slate-500 uppercase tracking-[1px] mb-[4px] font-extrabold">Total Logs</span>
          <span className="text-[2rem] font-black text-[#00a8e8] dark:text-[#38bdf8] leading-none">{logs.length}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[0.75rem] text-[#94a3b8] dark:text-slate-500 uppercase tracking-[1px] mb-[4px] font-extrabold">Today's Actions</span>
          <span className="text-[2rem] font-black text-[#10b981] dark:text-emerald-400 leading-none">{todayCount}</span>
        </div>
      </div>
    </div>
  );
};

export default AuditStatsHeader;