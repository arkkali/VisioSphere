import { getStatusText, statusClass } from './auditUtils';

const AuditTable = ({
  loading,
  filteredLogs,
  paginatedLogs,
  currentPage,
  totalPages,
  indexOfFirstLog,
  indexOfLastLog,
  onViewDetails,
  onPageChange,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
      <div className="p-[16px_24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
        <span className="text-[0.95rem] text-[#64748b] dark:text-slate-400 font-medium">
          Showing{' '}
          <strong className="text-[#00212e] dark:text-white">
            {filteredLogs.length === 0 ? 0 : indexOfFirstLog + 1}–{Math.min(indexOfLastLog, filteredLogs.length)}
          </strong>{' '}
          of{' '}
          <strong className="text-[#00212e] dark:text-white">{filteredLogs.length}</strong> logs
        </span>
      </div>

      <div className="overflow-x-auto min-h-[400px]">
        {loading ? (
          <div className="p-[60px] text-center text-[#94a3b8] dark:text-slate-500 font-medium text-[1rem]">
            Loading secure audit logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-[60px] text-center text-[#94a3b8] dark:text-slate-500 font-medium text-[1rem]">
            No logs match the current filters.
          </div>
        ) : (
          <table className="w-full border-collapse text-[0.85rem] text-left">
            <thead className="bg-[#f8fafc] dark:bg-slate-900/50 border-b border-[#e2e8f0] dark:border-slate-700">
              <tr>
                {['Timestamp', 'Category', 'Event', 'Actor', 'Purpose', 'Status', 'Action'].map((h, i) => (
                  <th
                    key={h}
                    className={`p-[16px_20px] text-[#00212e] dark:text-slate-300 font-black uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap${i === 2 ? ' hidden md:table-cell' : i === 3 ? ' hidden lg:table-cell' : i === 4 ? ' hidden xl:table-cell' : i >= 5 ? ' text-center' : ''}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.map(log => {
                const logDate = new Date(log.createdAt);
                return (
                  <tr key={log._id} className="border-b border-[#f1f5f9] dark:border-slate-700 transition-colors duration-150 hover:bg-[#f8fafc] dark:hover:bg-slate-800/50">
                    <td className="p-[16px_20px] align-middle">
                      <div className="flex flex-col gap-[2px]">
                        <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8]">
                          {logDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="text-[0.75rem] font-medium text-[#64748b] dark:text-slate-500">
                          {logDate.toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="p-[16px_20px] align-middle">
                      <span className="inline-block p-[4px_10px] bg-[#e1f5fe] dark:bg-[#0284c7]/20 rounded-[6px] text-[#0284c7] dark:text-[#38bdf8] font-bold text-[0.75rem] tracking-[0.5px] uppercase">
                        {log.category}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle font-bold text-[#00212e] dark:text-white hidden md:table-cell">
                      {log.event}
                    </td>
                    <td className="p-[16px_20px] align-middle hidden lg:table-cell">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-[#2E3A59] dark:text-slate-300 text-[0.8rem] uppercase tracking-[0.5px]">
                          {log.actorName || 'Unknown'}
                        </span>
                        <span className="text-[#475569] dark:text-slate-400 font-medium text-[0.85rem]">
                          {log.actorRole || 'System'}
                        </span>
                      </div>
                    </td>
                    <td className="p-[16px_20px] align-middle text-[#64748b] dark:text-slate-400 hidden xl:table-cell max-w-[200px] truncate" title={log.purpose}>
                      {log.purpose || 'N/A'}
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      <span className={`inline-block px-[10px] py-[4px] rounded-[6px] text-[0.7rem] font-black uppercase tracking-[0.8px] ${statusClass(log.status)}`}>
                        {getStatusText(log.status)}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      <button
                        className="px-[16px] py-[8px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[6px] font-bold text-[0.8rem] cursor-pointer transition-all hover:bg-[#00a8e8] dark:hover:bg-[#00a8e8] hover:text-white dark:hover:text-white hover:border-[#00a8e8] dark:hover:border-[#00a8e8]"
                        onClick={() => onViewDetails(log)}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-[12px] p-[20px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-[16px] py-[8px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 text-[#2E3A59] dark:text-slate-300 rounded-[6px] font-bold text-[0.85rem] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <div className="text-[0.85rem] font-medium text-[#64748b] dark:text-slate-400">
            Page <strong className="text-[#00212e] dark:text-white">{currentPage}</strong> of{' '}
            <strong className="text-[#00212e] dark:text-white">{totalPages}</strong>
          </div>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-[16px] py-[8px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 text-[#2E3A59] dark:text-slate-300 rounded-[6px] font-bold text-[0.85rem] transition-colors hover:bg-[#f1f5f9] dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default AuditTable;