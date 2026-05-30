import React from 'react';

const getFullName = (person) => {
  if (!person) return 'Unknown';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const NurseTable = ({
  loading,
  currentNurses,
  selectedCheckboxes,
  onCheckboxChange,
  onSelectAll,
  onStatusChange,
  onOpenAssignDrawer,
  currentPage,
  totalPages,
  indexOfFirstItem,
  indexOfLastItem,
  filteredTotal,
  onPageChange,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-[12px] shadow-sm border border-[#E5E7EB] dark:border-slate-700 overflow-hidden transition-colors duration-300">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.85rem] text-[#2E3A59] dark:text-slate-300">
          <thead className="bg-[#F8FAFC] dark:bg-slate-900/50 border-b border-[#E5E7EB] dark:border-slate-700">
            <tr>
              <th className="w-[40px] text-center p-[16px_12px] font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">
                <input
                  type="checkbox"
                  className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                  onChange={onSelectAll}
                  checked={currentNurses.length > 0 && currentNurses.every((n) => selectedCheckboxes.has(n.nurseId))}
                />
              </th>
              <th className="p-[16px_12px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Nurse ID</th>
              <th className="p-[16px_12px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Name</th>
              <th className="p-[16px_12px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">House Assigned</th>
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Elders Assigned</th>
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Setup Status</th>
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Account Status</th>
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" className="text-center p-[60px] text-[#A8A8A8] dark:text-slate-500 font-medium text-[1rem]">Loading medical staff...</td></tr>
            ) : currentNurses.length === 0 ? (
              <tr><td colSpan="8" className="text-center p-[60px] text-[#A8A8A8] dark:text-slate-500 font-medium text-[1rem]">No records found.</td></tr>
            ) : (
              currentNurses.map((nurse) => (
                <tr key={nurse.nurseId} className="border-b border-[#F8FAFC] dark:border-slate-700 transition-colors duration-200 hover:bg-[#e1f5fe]/30 dark:hover:bg-slate-700/50">
                  <td className="w-[40px] text-center p-[16px_12px] align-middle">
                    <input
                      type="checkbox"
                      className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                      checked={selectedCheckboxes.has(nurse.nurseId)}
                      onChange={() => onCheckboxChange(nurse.nurseId)}
                    />
                  </td>
                  <td className="p-[16px_12px] align-middle">
                    <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8] font-mono text-[0.9rem] bg-[#e1f5fe] dark:bg-[#0284c7]/20 p-[4px_8px] rounded-[4px]">{nurse.nurseId}</span>
                  </td>
                  <td className="p-[16px_12px] align-middle">
                    <span className="font-bold text-[#00212e] dark:text-white text-[0.95rem] block">{getFullName(nurse)}</span>
                    <span className="text-[#4A4A4A] dark:text-slate-400 text-[0.75rem] font-medium">{nurse.email}</span>
                  </td>
                  <td className="p-[16px_12px] align-middle font-semibold text-[#2E3A59] dark:text-slate-300">
                    {nurse.houseAssigned?.replace('House of ', '') || 'Unassigned'}
                  </td>
                  <td className="p-[16px_12px] align-middle text-center">
                    {(!nurse.assignedElders || nurse.assignedElders.length === 0) ? (
                      <span className="inline-block p-[4px_10px] bg-[#f1f5f9] dark:bg-slate-700 text-[#64748b] dark:text-slate-300 rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px]">None</span>
                    ) : nurse.assignedElders.length >= 10 ? (
                      <span className="inline-block p-[4px_10px] bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border border-[#fecdd3] dark:border-rose-900/50 rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px]">Max Capacity</span>
                    ) : (
                      <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8] text-[0.95rem]">{nurse.assignedElders.length} Residents</span>
                    )}
                  </td>
                  <td className="p-[16px_12px] align-middle text-center">
                    {nurse.linkedAdminId ? (
                      <span className="inline-block p-[4px_10px] bg-[#e0e7ff] dark:bg-indigo-950/30 text-[#4f46e5] dark:text-indigo-400 border border-[#c7d2fe] dark:border-indigo-900/50 rounded-full text-[0.7rem] font-bold uppercase tracking-[0.5px]">Linked to Admin</span>
                    ) : nurse.isFirstLogin ? (
                      <span className="inline-block p-[4px_10px] bg-[#fff7ed] dark:bg-amber-950/30 text-[#e11d48] dark:text-amber-500 border border-[#ffedd5] dark:border-amber-700/50 rounded-full text-[0.7rem] font-bold uppercase tracking-[0.5px]">Pending</span>
                    ) : (
                      <span className="inline-block p-[4px_10px] bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#059669] dark:text-emerald-400 border border-[#dcfce7] dark:border-emerald-900/50 rounded-full text-[0.7rem] font-bold uppercase tracking-[0.5px]">Completed</span>
                    )}
                  </td>
                  <td className="p-[16px_12px] align-middle text-center">
                    <select
                      className={`appearance-none font-bold text-[0.75rem] text-center tracking-[0.3px] uppercase p-[6px_12px] rounded-[6px] border cursor-pointer outline-none transition-colors ${nurse.status === 'Active' ? 'bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#059669] dark:text-emerald-400 border-[#bbf7d0] dark:border-emerald-900/50' : nurse.status === 'Inactive' ? 'bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border-[#fecdd3] dark:border-rose-900/50' : 'bg-[#fffbeb] dark:bg-amber-950/30 text-[#d97706] dark:text-amber-500 border-[#fde68a] dark:border-amber-700/50'}`}
                      value={nurse.status || 'Active'}
                      onChange={(e) => onStatusChange(nurse.nurseId, e.target.value)}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                      <option value="On Leave">On Leave</option>
                    </select>
                  </td>
                  <td className="p-[16px_12px] align-middle text-center">
                    <button
                      onClick={() => onOpenAssignDrawer(nurse)}
                      className="bg-[#00435c] dark:bg-slate-700 text-white p-[8px_16px] rounded-[6px] text-[0.8rem] font-bold hover:bg-[#00212e] dark:hover:bg-slate-600 transition-colors"
                    >
                      Assign Elders
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center p-[16px_24px] border-t border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50">
          <span className="text-[0.85rem] text-[#4A4A4A] dark:text-slate-400 font-medium">
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredTotal)} of {filteredTotal} entries
          </span>
          <div className="flex gap-[8px]">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-[8px_16px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 hover:bg-[#E5E7EB] dark:hover:bg-slate-700 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => onPageChange(i + 1)}
                className={`w-[36px] h-[36px] rounded-[6px] font-bold text-[0.85rem] flex items-center justify-center transition-colors ${currentPage === i + 1 ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-none' : 'bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border border-[#A8A8A8] dark:border-slate-600 hover:bg-[#E5E7EB] dark:hover:bg-slate-700'}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-[8px_16px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 hover:bg-[#E5E7EB] dark:hover:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NurseTable;