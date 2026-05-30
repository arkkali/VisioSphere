import React from 'react';

const ImportPreviewModal = ({ previewData, onEdit, onConfirm, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease] backdrop-blur-[3px] p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[14px] shadow-2xl w-[90%] max-w-[800px] max-h-[90vh] flex flex-col animate-[slideUp_0.3s_ease] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-[24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[14px]">
          <h2 className="m-0 text-[1.4rem] text-[#00212e] dark:text-white font-extrabold flex items-center gap-[10px]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[24px] h-[24px] text-[#00a8e8] dark:text-[#38bdf8]">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            Verify Imported Data
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

        <div className="p-[24px] overflow-y-auto flex-1">
          <div className="bg-[#e1f5fe] dark:bg-[#0284c7]/20 border border-[#00a8e8] dark:border-[#38bdf8] rounded-[8px] p-[16px] mb-[24px]">
            <p className="text-[#00435c] dark:text-[#38bdf8] text-[0.95rem] m-0 font-medium leading-[1.5]">
              <strong>Action Required:</strong> The system has guessed the separation of First and Last names from your single-column file. Please review the table below. If a middle name or multi-part last name (like "De La Cruz") was guessed incorrectly, click inside the box to fix it before saving.
            </p>
          </div>

          <table className="w-full text-left border-collapse border border-[#e2e8f0] dark:border-slate-700 rounded-[8px] overflow-hidden shadow-sm">
            <thead>
              <tr className="bg-[#f8fafc] dark:bg-slate-900/50 border-b-2 border-[#e2e8f0] dark:border-slate-700">
                <th className="p-[12px_16px] text-[0.8rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px]">Original Uploaded Text</th>
                <th className="p-[12px_16px] text-[0.8rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px] border-l border-[#e2e8f0] dark:border-slate-700">First Name</th>
                <th className="p-[12px_16px] text-[0.8rem] font-bold text-[#2E3A59] dark:text-slate-300 uppercase tracking-[0.5px] border-l border-[#e2e8f0] dark:border-slate-700">Last Name</th>
              </tr>
            </thead>
            <tbody>
              {previewData.map((row, index) => (
                <tr key={index} className="border-b border-[#e2e8f0] dark:border-slate-700 hover:bg-[#f8fafc] dark:hover:bg-slate-800/50">
                  <td className="p-[12px_16px] text-[0.9rem] text-[#64748b] dark:text-slate-400 bg-[#f1f5f9] dark:bg-slate-900/30 font-medium">{row.originalName}</td>
                  <td className="p-[8px] border-l border-[#e2e8f0] dark:border-slate-700">
                    <input
                      type="text"
                      value={row.firstName}
                      onChange={(e) => onEdit(index, 'firstName', e.target.value)}
                      className="w-full p-[8px_12px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[6px] font-bold text-[#2E3A59] dark:text-white text-[0.9rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
                    />
                  </td>
                  <td className="p-[8px] border-l border-[#e2e8f0] dark:border-slate-700">
                    <input
                      type="text"
                      value={row.lastName}
                      onChange={(e) => onEdit(index, 'lastName', e.target.value)}
                      className="w-full p-[8px_12px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 rounded-[6px] font-bold text-[#2E3A59] dark:text-white text-[0.9rem] outline-none focus:border-[#00a8e8] dark:focus:border-[#38bdf8] focus:shadow-[0_0_0_3px_rgba(0,168,232,0.15)] transition-all"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_24px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[14px]">
          <button
            className="p-[12px_24px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
          >
            Cancel Import
          </button>
          <button
            className="p-[12px_28px] border-none bg-gradient-to-br from-[#00a8e8] to-[#0075a2] dark:from-[#0284c7] dark:to-[#0369a1] text-white rounded-[8px] font-bold hover:from-[#0075a2] hover:to-[#00435c] dark:hover:from-[#0369a1] dark:hover:to-[#0f172a] shadow-[0_4px_12px_rgba(0,168,232,0.25)] hover:-translate-y-[2px] transition-all"
            onClick={onConfirm}
          >
            Confirm & Save to Database
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportPreviewModal;