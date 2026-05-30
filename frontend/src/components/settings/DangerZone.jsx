const DeactivateModal = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 w-screen h-screen bg-[#00212e]/60 dark:bg-slate-950/80 backdrop-blur-[3px] flex justify-center items-center z-[9999] p-[20px] animate-[fadeIn_0.2s_ease]">
    <div className="bg-white dark:bg-slate-800 p-[32px] rounded-[16px] w-full max-w-[450px] shadow-2xl flex flex-col gap-[24px] animate-[modalSlideUp_0.3s_ease]">
      <div className="flex flex-col items-center text-center">
        <div className="w-[64px] h-[64px] bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 rounded-full flex items-center justify-center mb-[16px] border-[4px] border-[#ffe4e6] dark:border-rose-900/50">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
        </div>
        <h3 className="m-0 text-[#e11d48] dark:text-rose-400 text-[1.5rem] font-black tracking-[-0.5px]">Deactivate Account?</h3>
        <p className="m-[12px_0_0_0] text-[#475569] dark:text-slate-400 text-[1rem] leading-[1.6]">You will be logged out immediately. Only another Administrator can reactivate your account.</p>
      </div>
      <div className="flex gap-[12px] mt-[8px]">
        <button className="flex-1 p-[14px] bg-white dark:bg-slate-800 text-[#475569] dark:text-slate-300 border border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[1rem] cursor-pointer hover:bg-[#f1f5f9] dark:hover:bg-slate-700 transition-colors" onClick={onCancel}>Cancel</button>
        <button className="flex-1 p-[14px] bg-[#e11d48] text-white border-none rounded-[8px] font-bold text-[1rem] cursor-pointer hover:bg-[#be123c] hover:-translate-y-[1px] transition-all shadow-[0_4px_12px_rgba(225,29,72,0.25)]" onClick={onConfirm}>Yes, Deactivate</button>
      </div>
    </div>
  </div>
);

const DangerZone = ({ activeModal, onOpenModal, onCloseModal, onConfirmDeactivate }) => (
  <>
    <div className="bg-[#fff1f2] dark:bg-rose-950/20 border border-[#fecaca] dark:border-rose-900/50 rounded-[16px] overflow-hidden transition-colors duration-300">
      <div className="p-[20px_24px] border-b border-[#fecaca] dark:border-rose-900/50 flex items-center gap-[12px]">
        <h3 className="m-0 text-[1.2rem] text-[#e11d48] dark:text-rose-400 font-extrabold">Danger Zone</h3>
      </div>
      <div className="p-[24px] flex flex-col md:flex-row justify-between items-start md:items-center gap-[16px]">
        <div>
          <h4 className="m-0 text-[1rem] text-[#00212e] dark:text-slate-200 font-bold mb-[4px]">Deactivate Account</h4>
          <p className="text-[0.9rem] text-[#64748b] dark:text-slate-400 m-0 max-w-[500px]">Temporarily disable your access. You will be logged out immediately and will require another administrator to reactivate your profile.</p>
        </div>
        <button onClick={() => onOpenModal('deactivate')} className="p-[12px_20px] bg-[#e11d48] text-white border-none rounded-[8px] font-bold text-[0.95rem] cursor-pointer hover:bg-[#be123c] transition-colors whitespace-nowrap shadow-[0_4px_12px_rgba(225,29,72,0.25)] hover:-translate-y-[1px]">Deactivate Account</button>
      </div>
    </div>

    {activeModal === 'deactivate' && (
      <DeactivateModal onConfirm={onConfirmDeactivate} onCancel={onCloseModal} />
    )}
  </>
);

export default DangerZone;