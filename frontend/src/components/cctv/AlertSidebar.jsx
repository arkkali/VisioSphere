import AlertItem from './AlertItem';

const FILTERS = ['All', 'Unresolved', 'Fall', 'Agitation', 'Pacing', 'Inactivity', 'Lying Down'];

const AlertSidebar = ({ filteredAlerts, filterModule, onFilterChange, unresolvedCount, onResolveIntent, onDismiss }) => (
  <div className="w-[340px] shrink-0 bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-xl shadow-sm flex flex-col h-full overflow-hidden transition-colors duration-300">
    <div className="p-4 border-b border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0 flex justify-between items-center transition-colors duration-300">
      <h2 className="text-[11px] font-black text-[#003543] dark:text-white uppercase tracking-widest m-0">AI Analytics Log</h2>
      {unresolvedCount > 0 && (
        <span className="bg-[#ff4757] text-white text-[9px] font-black px-2 py-0.5 rounded-full">
          {unresolvedCount} active
        </span>
      )}
    </div>

    <div className="p-2 bg-[#f8fafc] dark:bg-slate-900/50 flex gap-1 border-b border-[#e2e8f0] dark:border-slate-700 shrink-0 flex-wrap transition-colors duration-300">
      {FILTERS.map(f => (
        <button
          key={f}
          onClick={() => onFilterChange(f)}
          className={`text-[9px] font-bold px-2 py-1.5 rounded transition-all tracking-wide ${filterModule === f ? 'bg-[#003543] dark:bg-sky-600 text-white shadow' : 'bg-white dark:bg-slate-800 text-[#9a9eab] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-slate-700 hover:text-[#003543] dark:hover:text-white border border-[#e2e8f0] dark:border-slate-700'}`}
        >
          {f}
        </button>
      ))}
    </div>

    <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 bg-[#f5f7f9] dark:bg-slate-900/50 scroll-smooth transition-colors duration-300">
      {filteredAlerts.length > 0 ? (
        filteredAlerts.map(a => (
          <AlertItem key={a._id} alert={a} onResolveIntent={onResolveIntent} onDismiss={onDismiss} />
        ))
      ) : (
        <div className="flex flex-col items-center justify-center h-full opacity-50">
          <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mb-3 shadow-sm">
            <svg className="w-6 h-6 text-[#9a9eab] dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-[#003543] dark:text-white m-0">Systems Clear</p>
          <p className="text-[10px] font-medium text-[#9a9eab] dark:text-slate-400 mt-1">No alerts detected</p>
        </div>
      )}
    </div>
  </div>
);

export default AlertSidebar;