import React from 'react';

const getFullName = (person) => {
  if (!person) return '';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

// The name to announce for a guardian. Falls back to the id so a record with
// no name still gets a distinct accessible name rather than a blank one.
const guardianDisplayName = (g) =>
  [g.firstName, g.lastName].filter(Boolean).join(' ').trim() || g.guardianId || 'Unknown';

const formatAssignedElders = (elders) => {
  if (!elders || elders.length === 0) return 'None';
  return elders.map((elder) => `${elder.firstName} ${elder.lastName}`).join(', ');
};

const GuardianTable = ({
  loading,
  currentGuardians,
  selectedCheckboxes,
  onCheckboxChange,
  onSelectAll,
  onStatusChange,
  onAssignClick,
  currentPage,
  totalPages,
  indexOfFirstItem,
  indexOfLastItem,
  filteredTotal,
  onPageChange,
}) => {
  const getStatusClasses = (statusValue) => {
    if (statusValue === 'ACTIVE') return 'border-[#047857] text-[#047857] bg-white hover:bg-[#f0fdf4] dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400 dark:hover:bg-emerald-900/40';
    if (statusValue === 'INACTIVE') return 'border-[#be123c] text-[#be123c] bg-white hover:bg-[#fff1f2] dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-900/40';
    if (statusValue === 'PENDING') return 'border-[#b45309] text-[#b45309] bg-white dark:bg-amber-950/30 dark:border-amber-700/50 dark:text-amber-500';
    return 'border-[#cbd5e1] text-[#64748b] bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-slate-400';
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-[12px] border border-[#e2e8f0] dark:border-slate-700 overflow-hidden shadow-sm transition-colors duration-300">
      <div className="overflow-x-auto min-h-[400px]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-[#f8fafc] dark:bg-slate-900/50 border-b border-[#e2e8f0] dark:border-slate-700">
              <th className="p-[16px_20px] w-[50px] text-center">
                {/* Unnamed, this read as a bare "checkbox" — nothing said it
                    selects the whole page. */}
                <input
                  type="checkbox"
                  aria-label="Select all guardians on this page"
                  className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                  onChange={(e) => onSelectAll(e.target.checked)}
                  checked={currentGuardians.length > 0 && currentGuardians.every((g) => selectedCheckboxes.has(g.guardianId))}
                />
              </th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase">Guardian ID</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase">Name & Details</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase">Contact Info</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase text-center">Linked Elders</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase text-center">Setup Status</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase text-center">Account Status</th>
              <th className="p-[16px_20px] font-black text-[#00212e] dark:text-slate-300 text-[0.75rem] tracking-[0.8px] uppercase text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="8" className="text-center p-[60px] text-[#64748b] dark:text-slate-400 font-medium">Loading database records...</td>
              </tr>
            ) : currentGuardians.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center p-[60px] text-[#64748b] dark:text-slate-400 font-medium">No guardian records found.</td>
              </tr>
            ) : (
              currentGuardians.map((guardian) => {
                const statusValue = guardian.status?.toUpperCase() || 'PENDING';
                // PENDING is the system's to set, not the admin's. Until the
                // guardian sets their password the account sits at PENDING and
                // the control is locked; setPassword() then moves it to ACTIVE
                // by itself and this unlocks as ACTIVE/INACTIVE. The backend
                // enforces the same rule, so a crafted request cannot get round
                // a disabled <select>.
                const setupPending = !guardian.isPasswordSet;
                const guardianName = guardianDisplayName(guardian);
                const eldersAssigned = guardian.assignedElders?.length > 0
                  ? formatAssignedElders(guardian.assignedElders)
                  : 'None';

                return (
                  <tr key={guardian.guardianId} className="border-b border-[#f1f5f9] dark:border-slate-700 hover:bg-[#f8fafc] dark:hover:bg-slate-800/50 transition-colors">
                    <td className="p-[16px_20px] text-center align-middle">
                      {/* Named per row: every row checkbox was identical to a
                          screen reader, with no way to tell which guardian was
                          about to be selected and then deleted. */}
                      <input
                        type="checkbox"
                        aria-label={`Select ${guardianName}`}
                        className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                        checked={selectedCheckboxes.has(guardian.guardianId)}
                        onChange={() => onCheckboxChange(guardian.guardianId)}
                      />
                    </td>
                    <td className="p-[16px_20px] align-middle">
                      <span className="bg-[#e0f2fe] dark:bg-[#0284c7]/20 text-[#00688f] dark:text-[#38bdf8] font-bold font-mono text-[0.85rem] px-[10px] py-[4px] rounded-[6px] tracking-wide">
                        {guardian.guardianId}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle">
                      <span className="block font-extrabold text-[#00212e] dark:text-white text-[0.95rem]">{getFullName(guardian)}</span>
                      <span className="block font-medium text-[#64748b] dark:text-slate-400 text-[0.8rem] mt-[2px]">
                        {guardian.gender === 'M' ? 'Male' : guardian.gender === 'F' ? 'Female' : 'Unspecified'}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle">
                      <div className="text-[0.85rem] font-bold text-[#2E3A59] dark:text-slate-300">{guardian.email}</div>
                      <div className="text-[0.8rem] font-medium text-[#64748b] dark:text-slate-400">{guardian.phone || 'No phone provided'}</div>
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      <span className={`font-semibold text-[0.85rem] ${eldersAssigned === 'None' ? 'text-[#64748b] dark:text-slate-400' : 'text-[#475569] dark:text-slate-300'}`}>
                        {eldersAssigned}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      <span className={`inline-block px-[12px] py-[4px] rounded-[6px] text-[0.7rem] font-bold tracking-[0.5px] uppercase ${guardian.isPasswordSet ? 'bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#047857] dark:text-emerald-400' : 'bg-[#fff1f2] dark:bg-rose-950/30 text-[#be123c] dark:text-rose-400'}`}>
                        {guardian.isPasswordSet ? 'COMPLETED' : 'PENDING'}
                      </span>
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      {setupPending ? (
                        <span
                          title="Set automatically. This guardian has not set their password yet; the account becomes Active on its own once they do."
                          className={`inline-block px-[12px] py-[4px] border rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px] text-center ${getStatusClasses('PENDING')}`}
                        >
                          PENDING
                        </span>
                      ) : (
                        /* This control CHANGES a guardian's account status on
                           selection. Unnamed it announced only as a combo box
                           reading "ACTIVE". */
                        <select
                          aria-label={`Account status for ${guardianName}`}
                          value={statusValue}
                          onChange={(e) => onStatusChange(guardian.guardianId, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className={`appearance-none cursor-pointer outline-none inline-block px-[12px] py-[4px] border rounded-[6px] text-[0.75rem] font-bold tracking-[0.5px] text-center transition-colors ${getStatusClasses(statusValue)}`}
                          style={{ textAlignLast: 'center' }}
                        >
                          <option value="ACTIVE" className="text-[#00212e] dark:text-white dark:bg-slate-800">ACTIVE</option>
                          <option value="INACTIVE" className="text-[#00212e] dark:text-white dark:bg-slate-800">INACTIVE</option>
                        </select>
                      )}
                    </td>
                    <td className="p-[16px_20px] align-middle text-center">
                      <button
                        className="bg-[#00212e] dark:bg-slate-700 text-white border-none rounded-[6px] px-[12px] py-[6px] font-bold text-[0.75rem] cursor-pointer hover:bg-[#00435c] dark:hover:bg-slate-600 transition-colors whitespace-nowrap mx-auto block w-max"
                        onClick={() => onAssignClick(guardian.guardianId)}
                      >
                        Assign Elders
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center p-[16px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
          <span className="text-[0.85rem] text-[#64748b] dark:text-slate-400 font-medium">
            Showing <strong className="text-[#00212e] dark:text-white">{indexOfFirstItem + 1}</strong> to <strong className="text-[#00212e] dark:text-white">{Math.min(indexOfLastItem, filteredTotal)}</strong> of <strong className="text-[#00212e] dark:text-white">{filteredTotal}</strong> entries
          </span>
          <div className="flex gap-[8px]">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-[12px] py-[6px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 transition-colors"
            >
              Prev
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-[12px] py-[6px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardianTable;