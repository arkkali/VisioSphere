import React from 'react';

const getFullName = (person) => {
  if (!person) return '';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const AssignEldersDrawer = ({
  linkingGuardian,
  availableResidents,
  assignSearchTerm,
  onSearchChange,
  onLink,
  onUnlink,
  onClose,
}) => {
  return (
    <>
      <div
        className="fixed inset-0 bg-[#00212e]/40 dark:bg-slate-950/80 z-[2000] backdrop-blur-[2px] animate-[fadeIn_0.2s_ease]"
        onClick={onClose}
      ></div>
      <div className="fixed top-0 right-0 h-full w-full sm:w-[450px] bg-[#f8fafc] dark:bg-slate-900 shadow-[-10px_0_40px_rgba(0,0,0,0.1)] dark:shadow-[-10px_0_40px_rgba(0,0,0,0.5)] z-[2001] flex flex-col animate-[slideInRight_0.3s_ease] transition-colors duration-300">

        <div className="p-[24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-800 flex justify-between items-start transition-colors duration-300">
          <div>
            <h2 className="text-[1.5rem] font-extrabold text-[#00212e] dark:text-white m-0">Assign Elders</h2>
            <p className="text-[#64748b] dark:text-slate-400 text-[0.9rem] font-medium m-0 mt-[4px]">
              For Guardian: <span className="text-[#00a8e8] dark:text-[#38bdf8] font-bold">{getFullName(linkingGuardian)}</span>
            </p>
          </div>
          <button
            className="bg-transparent border border-[#cbd5e1] dark:border-slate-600 w-[32px] h-[32px] rounded-full flex items-center justify-center text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 hover:text-[#00212e] dark:hover:text-white cursor-pointer transition-colors"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[16px] h-[16px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[24px] custom-scrollbar">
          <div className="mb-[32px]">
            <div className="flex justify-between items-center mb-[16px]">
              <h3 className="text-[1.05rem] font-extrabold text-[#00212e] dark:text-white m-0">Currently Assigned</h3>
              <span className={`font-black text-[0.9rem] px-[10px] py-[4px] rounded-full ${((linkingGuardian.assignedElders?.length || 0) >= 10) ? 'bg-[#ffe4e6] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400' : 'bg-[#e1f5fe] dark:bg-[#0284c7]/20 text-[#00a8e8] dark:text-[#38bdf8]'}`}>
                {linkingGuardian.assignedElders?.length || 0} / 10
              </span>
            </div>

            {(!linkingGuardian.assignedElders || linkingGuardian.assignedElders.length === 0) ? (
              <div className="bg-[#F8FAFC] dark:bg-slate-900/50 border border-dashed border-[#A8A8A8] dark:border-slate-600 rounded-[8px] p-[32px] text-center text-[#A8A8A8] dark:text-slate-500 font-medium text-[0.9rem]">
                No elders currently assigned to this guardian.
              </div>
            ) : (
              <div className="flex flex-col gap-[10px]">
                {linkingGuardian.assignedElders.map((elder) => (
                  <div key={elder.residentId} className="flex justify-between items-center bg-white dark:bg-slate-800 p-[16px] border border-[#e2e8f0] dark:border-slate-700 rounded-[8px] shadow-sm transition-colors duration-300">
                    <div>
                      <span className="block font-bold text-[#00212e] dark:text-white text-[0.95rem]">{elder.firstName} {elder.lastName}</span>
                      <span className="block font-medium text-[#64748b] dark:text-slate-400 text-[0.8rem] mt-[2px]">{elder.residentId}</span>
                    </div>
                    <button
                      onClick={() => onUnlink(elder.residentId)}
                      className="bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border-none px-[12px] py-[6px] rounded-[6px] font-bold text-[0.8rem] cursor-pointer hover:bg-[#ffe4e6] dark:hover:bg-rose-900/50 transition-colors"
                    >
                      Unassign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-[1.05rem] font-extrabold text-[#00212e] dark:text-white m-0 mb-[16px]">Available Residents</h3>
            <div className="flex items-center gap-[10px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 rounded-[8px] p-[10px_16px] mb-[16px] focus-within:border-[#00a8e8] dark:focus-within:border-[#38bdf8] focus-within:shadow-[0_0_0_3px_rgba(0,168,232,0.1)] transition-all">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[16px] h-[16px] text-[#94a3b8] dark:text-slate-500">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search elders..."
                value={assignSearchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full border-none outline-none font-medium text-[#00212e] dark:text-white bg-transparent text-[0.9rem] placeholder:text-[#94a3b8] dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-[10px]">
              {availableResidents.length === 0 ? (
                <p className="text-[#94a3b8] dark:text-slate-500 font-medium text-center text-[0.9rem] py-[20px]">
                  No unassigned residents match your search.
                </p>
              ) : (
                availableResidents.map((res) => (
                  <div key={res.residentId} className="flex justify-between items-center bg-white dark:bg-slate-800 p-[16px] border border-[#e2e8f0] dark:border-slate-700 rounded-[8px] hover:border-[#00a8e8] dark:hover:border-[#38bdf8] transition-colors duration-300">
                    <div>
                      <span className="block font-bold text-[#00212e] dark:text-white text-[0.95rem]">{res.firstName} {res.lastName}</span>
                      <span className="block font-medium text-[#64748b] dark:text-slate-400 text-[0.8rem] mt-[2px]">{res.residentId}</span>
                    </div>
                    <button
                      onClick={() => onLink(res.residentId)}
                      className="bg-[#00a8e8] dark:bg-[#0284c7] text-white border-none px-[16px] py-[8px] rounded-[6px] font-bold text-[0.85rem] cursor-pointer hover:bg-[#0088b8] dark:hover:bg-[#0369a1] shadow-sm transition-transform hover:-translate-y-[1px]"
                    >
                      Assign
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AssignEldersDrawer;