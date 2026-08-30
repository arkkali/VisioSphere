import React from 'react';
import { hasHouseChoice, assignsEldersToNurses } from '../../constants/houses';

// The name to PRINT for a nurse: her own Display Name when she has set one,
// her legal name otherwise. `profileName` is resolved server-side
// (backend/models/Nurse.js) so web and mobile can never disagree; the rest is
// a fallback for a backend deployed before profileName existed.
//
// Deliberately separate from getFullName, which is also used for residents and
// must keep printing the legal name.
const nurseDisplayName = (nurse) => {
  if (!nurse) return 'Unknown';
  const resolved = (nurse.profileName || '').trim() || (nurse.displayName || '').trim();
  return resolved || [nurse.firstName, nurse.middleName, nurse.lastName].filter(Boolean).join(' ') || 'Unknown';
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
  // Resolved once per render: the facility cannot change without a fresh login.
  const showHouse = hasHouseChoice();
  // Saint Anthony has no per-nurse caseload, so both the "Elders Assigned"
  // column and the Assign action are meaningless there — an empty column that
  // always reads "None" looks like missing data rather than a fact about the
  // facility. See assignsEldersToNurses in constants/houses.js.
  const showAssign = assignsEldersToNurses();
  // Fixed columns: checkbox, Nurse ID, Name, Setup Status, Account Status.
  // House adds one; the caseload pair adds Elders Assigned + Actions.
  const columnCount = 5 + (showHouse ? 1 : 0) + (showAssign ? 2 : 0);

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
              {/* Grace's only — see hasHouseChoice(). Saint Anthony is one building,
                  so this column would repeat the same value on every row. */}
              {showHouse && (
                <th className="p-[16px_12px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">House Assigned</th>
              )}
              {showAssign && (
                <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Elders Assigned</th>
              )}
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Setup Status</th>
              <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Account Status</th>
              {showAssign && (
                <th className="p-[16px_12px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Actions</th>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columnCount} className="text-center p-[60px] text-[#A8A8A8] dark:text-slate-500 font-medium text-[1rem]">Loading medical staff...</td></tr>
            ) : currentNurses.length === 0 ? (
              <tr><td colSpan={columnCount} className="text-center p-[60px] text-[#A8A8A8] dark:text-slate-500 font-medium text-[1rem]">No records found.</td></tr>
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
                    <span className="font-bold text-[#00212e] dark:text-white text-[0.95rem] block">{nurseDisplayName(nurse)}</span>
                    <span className="text-[#4A4A4A] dark:text-slate-400 text-[0.75rem] font-medium">{nurse.email}</span>
                  </td>
                  {showHouse && (
                    <td className="p-[16px_12px] align-middle font-semibold text-[#2E3A59] dark:text-slate-300">
                      {nurse.houseAssigned?.replace('House of ', '') || 'Unassigned'}
                    </td>
                  )}
                  {showAssign && (
                  <td className="p-[16px_12px] align-middle text-center">
                    {(!nurse.assignedElders || nurse.assignedElders.length === 0) ? (
                      <span className="inline-block p-[4px_10px] bg-[#f1f5f9] dark:bg-slate-700 text-[#64748b] dark:text-slate-300 rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px]">None</span>
                    ) : nurse.assignedElders.length >= 10 ? (
                      <span className="inline-block p-[4px_10px] bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border border-[#fecdd3] dark:border-rose-900/50 rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px]">Max Capacity</span>
                    ) : (
                      <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8] text-[0.95rem]">{nurse.assignedElders.length} Residents</span>
                    )}
                  </td>
                  )}
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
                      className={`appearance-none dark:[color-scheme:dark] font-bold text-[0.75rem] text-center tracking-[0.3px] uppercase p-[6px_12px] rounded-[6px] border cursor-pointer outline-none transition-colors ${nurse.status === 'Active' ? 'bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#059669] dark:text-emerald-400 border-[#bbf7d0] dark:border-emerald-900/50' : nurse.status === 'Inactive' ? 'bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border-[#fecdd3] dark:border-rose-900/50' : 'bg-[#fffbeb] dark:bg-amber-950/30 text-[#d97706] dark:text-amber-500 border-[#fde68a] dark:border-amber-700/50'}`}
                      value={nurse.status || 'Active'}
                      onChange={(e) => onStatusChange(nurse.nurseId, e.target.value)}
                    >
                      <option value="Active" className="bg-[#ecfdf5] text-[#065f46] dark:bg-emerald-950 dark:text-emerald-300">Active</option>
                      <option value="Inactive" className="bg-[#fff1f2] text-[#9f1239] dark:bg-rose-950 dark:text-rose-300">Inactive</option>
                      <option value="On Leave" className="bg-[#fffbeb] text-[#92400e] dark:bg-amber-950 dark:text-amber-300">On Leave</option>
                    </select>
                  </td>
                  {showAssign && (
                    <td className="p-[16px_12px] align-middle text-center">
                      <button
                        onClick={() => onOpenAssignDrawer(nurse)}
                        className="bg-[#00435c] dark:bg-slate-700 text-white p-[8px_16px] rounded-[6px] text-[0.8rem] font-bold hover:bg-[#00212e] dark:hover:bg-slate-600 transition-colors"
                      >
                        Assign Elders
                      </button>
                    </td>
                  )}
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