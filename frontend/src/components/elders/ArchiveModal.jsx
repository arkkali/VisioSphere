import React from 'react';

const ArchiveModal = ({ archivedReports, loadingArchives, onDownload, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease] backdrop-blur-[3px] p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl w-[90%] max-w-[800px] flex flex-col max-h-[90vh] animate-[slideUp_0.28s_ease] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-[24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[14px]">
          <h2 className="m-0 text-[1.4rem] text-[#00212e] dark:text-white font-extrabold flex items-center gap-[10px]">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" className="text-[#00a8e8] dark:text-[#38bdf8]" strokeWidth="2.5">
              <path d="M21 8v13H3V8"></path>
              <path d="M1 3h22v5H1z"></path>
              <path d="M10 12h4"></path>
            </svg>
            Archived Reports
          </h2>
          <button
            className="bg-transparent border-none w-[34px] h-[34px] flex items-center justify-center cursor-pointer rounded-[7px] transition-all text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-slate-700 hover:text-[#d32f2f] dark:hover:text-rose-400"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-[24px] overflow-y-auto flex-1 bg-[#f8fafc] dark:bg-slate-900/30">
          {loadingArchives ? (
            <p className="text-center text-[#64748b] dark:text-slate-400 font-medium py-[40px]">Loading archives...</p>
          ) : archivedReports.length === 0 ? (
            <div className="text-center py-[40px]">
              <p className="text-[#64748b] dark:text-slate-400 font-medium">No archived reports found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              {archivedReports.map((report) => (
                <div
                  key={report._id}
                  className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[8px] p-[16px] shadow-sm flex flex-col gap-[12px] hover:border-[#00a8e8] dark:hover:border-[#38bdf8] transition-colors"
                >
                  <div className="flex justify-between items-center border-b border-[#e2e8f0] dark:border-slate-700 pb-[8px]">
                    <span className="font-extrabold text-[#00212e] dark:text-white text-[1.1rem]">{report.reportDate}</span>
                    <span className="text-[0.75rem] font-bold text-[#64748b] dark:text-slate-400 bg-[#f1f5f9] dark:bg-slate-700 px-[8px] py-[4px] rounded-[4px]">
                      {new Date(report.updatedAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] font-bold text-[#64748b] dark:text-slate-500 uppercase tracking-[0.5px]">Total</span>
                      <span className="font-black text-[#00a8e8] dark:text-[#38bdf8] text-[1.2rem]">{report.totalResidents}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] font-bold text-[#64748b] dark:text-slate-500 uppercase tracking-[0.5px]">Present</span>
                      <span className="font-black text-[#10b981] dark:text-emerald-400 text-[1.2rem]">{report.totalPresent}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[0.7rem] font-bold text-[#64748b] dark:text-slate-500 uppercase tracking-[0.5px]">Absent</span>
                      <span className="font-black text-[#e11d48] dark:text-rose-400 text-[1.2rem]">{report.totalNotPresent}</span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-[12px] pt-[12px] border-t border-[#e2e8f0] dark:border-slate-700">
                    <button
                      onClick={() => onDownload(report)}
                      className="w-full p-[8px_16px] bg-[#e1f5fe] dark:bg-[#0284c7]/20 text-[#00a8e8] dark:text-[#38bdf8] font-bold text-[0.8rem] rounded-[6px] hover:bg-[#00a8e8] dark:hover:bg-[#0284c7] hover:text-white dark:hover:text-white transition-all flex items-center justify-center gap-[6px]"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                      </svg>
                      Download PDF
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-[14px]">
          <button
            className="p-[10px_24px] border-none bg-gradient-to-br from-[#00a8e8] to-[#0075a2] dark:from-[#0284c7] dark:to-[#0369a1] text-white rounded-[8px] font-bold shadow-[0_4px_12px_rgba(0,168,232,0.25)] hover:-translate-y-[2px] transition-all"
            onClick={onClose}
          >
            Close Archive
          </button>
        </div>
      </div>
    </div>
  );
};

export default ArchiveModal;