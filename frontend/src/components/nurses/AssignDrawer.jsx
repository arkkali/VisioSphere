import React from 'react';


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

const getFullName = (person) => {
  if (!person) return 'Unknown';
  return [person.firstName, person.middleName, person.lastName].filter(Boolean).join(' ');
};

const AssignDrawer = ({
  open,
  nurse,
  elders,
  elderSearchTerm,
  onSearchChange,
  onClose,
  onAssign,
  onUnassign,
}) => {
  if (!open || !nurse) return null;

  const assignedCount = nurse.assignedElders?.length || 0;
  const atCapacity = assignedCount >= 10;

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end">
      <div
        className="absolute inset-0 bg-[#00212e]/40 dark:bg-slate-950/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-[450px] bg-white dark:bg-slate-800 h-full shadow-2xl flex flex-col animate-[slideInRight_0.3s_ease-out] transition-colors duration-300">

        <div className="p-[24px] border-b border-[#E5E7EB] dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900/50 flex justify-between items-center">
          <div>
            <h2 className="m-0 text-[1.4rem] text-[#00212e] dark:text-white font-extrabold">Assign Elders</h2>
            <p className="m-0 text-[0.9rem] text-[#4A4A4A] dark:text-slate-400 font-medium mt-[4px]">
              For Nurse: <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8]">{nurseDisplayName(nurse)}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-[36px] h-[36px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 rounded-full flex items-center justify-center text-[#4A4A4A] dark:text-slate-400 hover:bg-[#E5E7EB] dark:hover:bg-slate-700 hover:text-[#e11d48] dark:hover:text-rose-400 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[24px]">

          <div className="mb-[32px]">
            <div className="flex justify-between items-center mb-[12px]">
              <h3 className="m-0 text-[1.1rem] font-bold text-[#00435c] dark:text-slate-200">Currently Assigned</h3>
              <span className={`font-black text-[0.9rem] px-[10px] py-[4px] rounded-full ${atCapacity ? 'bg-[#ffe4e6] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400' : 'bg-[#e1f5fe] dark:bg-[#0284c7]/20 text-[#00a8e8] dark:text-[#38bdf8]'}`}>
                {assignedCount} / 10
              </span>
            </div>

            {assignedCount === 0 ? (
              <div className="bg-[#F8FAFC] dark:bg-slate-900/50 border border-dashed border-[#A8A8A8] dark:border-slate-600 rounded-[8px] p-[20px] text-center text-[#A8A8A8] dark:text-slate-500 font-medium text-[0.9rem]">
                No elders currently assigned to this nurse.
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {nurse.assignedElders.map((elder, idx) => (
                  <div key={idx} className="flex justify-between items-center p-[12px_16px] bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-600 rounded-[8px] shadow-sm">
                    <div>
                      <p className="m-0 font-bold text-[#00212e] dark:text-white text-[0.95rem]">{getFullName(elder)}</p>
                      <p className="m-0 font-mono text-[0.75rem] text-[#4A4A4A] dark:text-slate-400">{elder.residentId || elder._id}</p>
                    </div>
                    <button
                      onClick={() => onUnassign(elder._id)}
                      className="text-[#e11d48] dark:text-rose-400 bg-[#fff1f2] dark:bg-rose-950/30 border border-[#fecdd3] dark:border-rose-900/50 p-[6px_12px] rounded-[6px] text-[0.8rem] font-bold hover:bg-[#ffe4e6] dark:hover:bg-rose-900/50 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <hr className="border-t border-[#E5E7EB] dark:border-slate-700 mb-[24px]" />

          <div>
            <h3 className="m-0 text-[1.1rem] font-bold text-[#00435c] dark:text-slate-200 mb-[12px]">Available Residents</h3>
            <div className="flex items-center gap-[8px] bg-white dark:bg-slate-800 border border-[#A8A8A8] dark:border-slate-600 rounded-[8px] p-[10px_12px] mb-[16px] focus-within:border-[#00a8e8] dark:focus-within:border-[#38bdf8] transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[16px] h-[16px] text-[#A8A8A8] dark:text-slate-500">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.35-4.35"></path>
              </svg>
              <input
                type="text"
                placeholder="Search elders..."
                value={elderSearchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="flex-1 border-none outline-none text-[0.9rem] text-[#00212e] dark:text-white bg-transparent placeholder:text-[#A8A8A8] dark:placeholder:text-slate-500"
              />
            </div>

            <div className="flex flex-col gap-[8px]">
              {elders.length === 0 ? (
                <p className="text-center text-[#A8A8A8] dark:text-slate-500 text-[0.9rem] italic">Loading directory...</p>
              ) : (
                elders
                  .filter((e) => {
                    const isAssigned = (nurse.assignedElders || []).some(
                      (assigned) => String(assigned._id) === String(e._id)
                    );
                    if (isAssigned) return false;
                    if (elderSearchTerm) return getFullName(e).toLowerCase().includes(elderSearchTerm.toLowerCase());
                    return true;
                  })
                  .map((elder, idx) => (
                    <div key={idx} className="flex justify-between items-center p-[12px_16px] bg-[#F8FAFC] dark:bg-slate-900/50 border border-[#E5E7EB] dark:border-slate-700 rounded-[8px] hover:border-[#A8A8A8] dark:hover:border-slate-500 transition-colors">
                      <div>
                        <p className="m-0 font-bold text-[#2E3A59] dark:text-slate-200 text-[0.95rem]">{getFullName(elder)}</p>
                        <p className="m-0 font-mono text-[0.75rem] text-[#4A4A4A] dark:text-slate-400">{elder.residentId || elder._id}</p>
                      </div>
                      <button
                        onClick={() => onAssign(elder)}
                        disabled={atCapacity}
                        className="text-white bg-[#00a8e8] dark:bg-[#0284c7] p-[6px_12px] rounded-[6px] text-[0.8rem] font-bold hover:bg-[#0075a2] dark:hover:bg-[#0369a1] disabled:bg-[#A8A8A8] dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
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
    </div>
  );
};

export default AssignDrawer;