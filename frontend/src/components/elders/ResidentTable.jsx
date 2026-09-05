import React from 'react';

const ResidentTable = ({
  loading,
  currentResidents,
  selectedHouse,
  selectedCheckboxes,
  expandedNotesId,
  tempNotes,
  setTempNotes,
  onCheckboxChange,
  onSelectAll,
  onAttendanceChange,
  onRowClick,
  onSaveNotes,
  onCloseNotes,
  getFullName,
  currentPage,
  totalPages,
  indexOfFirstItem,
  indexOfLastItem,
  filteredCount,
  onPageChange,
}) => {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-[12px] shadow-sm border border-[#E5E7EB] dark:border-slate-700 overflow-hidden transition-colors duration-300">
      <div className="overflow-x-auto min-h-[400px]">
        <table className="w-full border-collapse text-[0.85rem] text-[#2E3A59] dark:text-slate-300">
          <thead className="bg-[#f8fafc] dark:bg-slate-900/50 border-b border-[#E5E7EB] dark:border-slate-700">
            <tr>
              <th className="w-[50px] text-center p-[16px_14px] font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">
                {/* Unnamed, this read as a bare "checkbox" — nothing said it
                    selects the whole page. */}
                <input
                  type="checkbox"
                  aria-label="Select all residents on this page"
                  className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                  onChange={onSelectAll}
                  checked={currentResidents.length > 0 && currentResidents.every((r) => selectedCheckboxes.has(r._id))}
                />
              </th>
              <th className="p-[16px_14px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Resident ID</th>
              <th className="p-[16px_14px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Full Name</th>
              {selectedHouse === 'Overall' && (
                <th className="p-[16px_14px] text-left font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">House</th>
              )}
              <th className="p-[16px_14px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Attendance</th>
              <th className="p-[16px_14px] text-center font-black text-[#00212e] dark:text-slate-300 uppercase tracking-[0.8px] text-[0.75rem] whitespace-nowrap">Monitoring Notes</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={selectedHouse === 'Overall' ? 6 : 5} className="text-center p-[60px_40px] text-[#64748b] dark:text-slate-400 font-medium text-[0.95rem]">
                  Loading residents database...
                </td>
              </tr>
            ) : currentResidents.length === 0 ? (
              <tr>
                <td colSpan={selectedHouse === 'Overall' ? 6 : 5} className="text-center p-[60px_40px] text-[#64748b] dark:text-slate-400 font-medium text-[0.95rem]">
                  No residents found for this view.
                </td>
              </tr>
            ) : (
              currentResidents.map((resident) => {
                const hasNotes = resident.notes && resident.notes.trim() !== '';
                return (
                  <React.Fragment key={resident._id}>
                    <tr className={`transition-colors duration-150 border-b border-[#f8fafc] dark:border-slate-700 hover:bg-[#e1f5fe]/30 dark:hover:bg-slate-700/50 ${expandedNotesId === resident._id ? 'bg-[#e1f5fe]/40 dark:bg-slate-800' : ''}`}>
                      <td className="w-[50px] text-center p-[16px_14px] text-[#475569] dark:text-slate-300 align-middle">
                        {/* Named per row: every row checkbox was identical to a
                            screen reader, with no way to tell which resident was
                            about to be selected and then deleted. */}
                        <input
                          type="checkbox"
                          aria-label={`Select ${getFullName(resident)}`}
                          className="w-[16px] h-[16px] cursor-pointer accent-[#00a8e8]"
                          checked={selectedCheckboxes.has(resident._id)}
                          onChange={() => onCheckboxChange(resident._id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="p-[16px_14px] text-[#0075a2] dark:text-[#38bdf8] align-middle font-mono font-bold">
                        {resident.residentId}
                      </td>
                      <td className="p-[16px_14px] text-[#00212e] dark:text-white align-middle font-bold text-[0.95rem]">
                        {getFullName(resident)}
                      </td>
                      {selectedHouse === 'Overall' && (
                        <td className="p-[16px_14px] text-[#475569] dark:text-slate-400 align-middle font-medium text-[0.85rem]">
                          {resident.house.replace('House of ', '')}
                        </td>
                      )}
                      <td className="p-[16px_14px] align-middle text-center min-w-[130px]">
                        {/* This control RECORDS a resident's attendance for the
                            day. Unnamed it announced only as a combo box reading
                            "Present", with no indication of whose day it was. */}
                        <select
                          aria-label={`Attendance for ${getFullName(resident)}`}
                          value={resident.attendance || ''}
                          onChange={(e) => onAttendanceChange(resident._id, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className={`w-[85%] p-[8px_30px_8px_12px] border-[1.5px] rounded-[6px] text-[0.85rem] font-bold cursor-pointer outline-none shadow-sm appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_10px_center] ${resident.attendance === 'Present' ? 'bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#059669] dark:text-emerald-400 border-[#bbf7d0] dark:border-emerald-900/50' : resident.attendance === 'Not Present' ? 'bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border-[#fecdd3] dark:border-rose-900/50' : 'bg-white dark:bg-slate-800 text-[#64748b] dark:text-slate-300 border-[#cbd5e1] dark:border-slate-600'}`}
                        >
                          {/* The <select> was themed but its <option>s were not.
                              A native option list does NOT inherit the select's
                              colours — the browser paints it from the OS theme,
                              so in dark mode the open dropdown came out as pale
                              text on a pale popup and was effectively unreadable.
                              Options only honour inline background/color, which
                              is why this is a style prop and not a class. */}
                          <option value="" disabled hidden
                            style={{ backgroundColor: '#ffffff', color: '#64748b' }}>
                            Mark Status
                          </option>
                          <option value="Present"
                            style={{ backgroundColor: '#ffffff', color: '#047857' }}>
                            Present
                          </option>
                          <option value="Not Present"
                            style={{ backgroundColor: '#ffffff', color: '#be123c' }}>
                            Not Present
                          </option>
                        </select>
                      </td>
                      <td className="p-[16px_14px] align-middle text-center min-w-[140px]">
                        <div className="flex items-center justify-center relative">
                          <button
                            className={`p-[8px_16px] border-[1.5px] rounded-[6px] text-[0.85rem] font-bold cursor-pointer transition-all duration-200 flex items-center gap-[6px] ${hasNotes ? 'border-[#00a8e8] dark:border-[#0284c7] bg-[#00a8e8] dark:bg-[#0284c7] text-white shadow-md' : 'border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-800 text-[#64748b] dark:text-slate-300 hover:border-[#00a8e8] dark:hover:border-[#38bdf8] hover:text-[#00a8e8] dark:hover:text-[#38bdf8]'}`}
                            onClick={() => onRowClick(resident._id)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[14px] h-[14px]">
                              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            {hasNotes ? 'Edit Notes' : 'Add Notes'}
                          </button>
                          {hasNotes && (
                            <span className="absolute top-[-4px] right-[16px] w-[12px] h-[12px] bg-[#f59e0b] dark:bg-amber-500 rounded-full border-2 border-white dark:border-slate-800 animate-pulse"></span>
                          )}
                        </div>
                      </td>
                    </tr>

                    {expandedNotesId === resident._id && (
                      <tr className="bg-[#f8fafc] dark:bg-slate-900 border-b-2 border-t-2 border-[#00a8e8] dark:border-[#38bdf8]">
                        <td colSpan={selectedHouse === 'Overall' ? 6 : 5} className="p-[24px_32px] text-center shadow-inner">
                          <div className="flex flex-col gap-[12px] text-left max-w-[800px] mx-auto">
                            <label className="font-extrabold text-[#00212e] dark:text-white text-[0.9rem] uppercase tracking-[0.5px] flex items-center gap-[8px]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[16px] h-[16px] text-[#00a8e8] dark:text-[#38bdf8]">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                              </svg>
                              Monitoring Notes for {getFullName(resident)}
                            </label>
                            <textarea
                              className="w-full min-h-[120px] p-[16px] border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-medium text-[0.95rem] text-[#2E3A59] dark:text-white bg-white dark:bg-slate-800 resize-y transition-all duration-200 outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] leading-[1.6]"
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              placeholder="Enter any behavioral observations, health concerns, or general comments here..."
                              autoFocus
                            />
                            <div className="flex gap-[12px] justify-end mt-[8px]">
                              <button
                                className="p-[10px_24px] border border-[#cbd5e1] dark:border-slate-600 bg-white dark:bg-slate-800 text-[#475569] dark:text-slate-300 rounded-[6px] font-bold text-[0.85rem] cursor-pointer hover:bg-[#e2e8f0] dark:hover:bg-slate-700"
                                onClick={onCloseNotes}
                              >
                                Cancel
                              </button>
                              <button
                                className="p-[10px_24px] border-none bg-[#00212e] dark:bg-[#0284c7] text-white rounded-[6px] font-bold text-[0.85rem] cursor-pointer shadow-md hover:bg-[#00435c] dark:hover:bg-[#0369a1]"
                                onClick={() => onSaveNotes(resident._id)}
                              >
                                Save Comments
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-between items-center p-[16px_24px] border-t border-[#E5E7EB] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
          <span className="text-[0.85rem] text-[#64748b] dark:text-slate-400 font-medium">
            Showing <strong className="text-[#00212e] dark:text-white">{indexOfFirstItem + 1}</strong> to{' '}
            <strong className="text-[#00212e] dark:text-white">{Math.min(indexOfLastItem, filteredCount)}</strong> of{' '}
            <strong className="text-[#00212e] dark:text-white">{filteredCount}</strong> records
          </span>
          <div className="flex gap-[8px]">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-[8px_16px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-[#e2e8f0] dark:hover:enabled:bg-slate-700 transition-colors"
            >
              Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => onPageChange(i + 1)}
                className={`w-[36px] h-[36px] rounded-[6px] font-bold text-[0.85rem] flex items-center justify-center transition-colors border-[1.5px] ${currentPage === i + 1 ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-[#00a8e8] dark:border-[#0284c7]' : 'bg-white dark:bg-slate-800 text-[#2E3A59] dark:text-slate-300 border-[#cbd5e1] dark:border-slate-600 hover:bg-[#e2e8f0] dark:hover:bg-slate-700'}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-[8px_16px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[6px] text-[#2E3A59] dark:text-slate-300 font-bold text-[0.85rem] disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-[#e2e8f0] dark:hover:enabled:bg-slate-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentTable;