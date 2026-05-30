import { useState } from 'react';

const EyeIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>
);

const EyeOffIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
    <line x1="1" y1="1" x2="23" y2="23"></line>
  </svg>
);

const TwoFAModal = ({ onConfirm, onCancel }) => {
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  const handleConfirm = () => {
    if (pinInput.length !== 6) {
      setError('PIN must be exactly 6 digits.');
      return;
    }
    if (pinInput !== pinConfirm) {
      setError('PINs do not match.');
      return;
    }
    onConfirm(pinInput);
  };

  return (
    <div className="fixed inset-0 w-screen h-screen bg-[#00212e]/60 dark:bg-slate-950/80 backdrop-blur-[3px] flex justify-center items-center z-[9999] p-[20px] animate-[fadeIn_0.2s_ease]">
      <div className="bg-white dark:bg-slate-800 p-[32px] rounded-[16px] w-full max-w-[420px] shadow-2xl flex flex-col gap-[24px] animate-[modalSlideUp_0.3s_ease]">
        <div className="flex flex-col items-center text-center">
          <div className="w-[56px] h-[56px] bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#10b981] dark:text-emerald-400 rounded-full flex items-center justify-center mb-[16px] border-[4px] border-[#d1fae5] dark:border-emerald-900/50">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          </div>
          <h3 className="m-0 text-[#00212e] dark:text-white text-[1.5rem] font-black tracking-[-0.5px]">Secure 2FA PIN</h3>
          <p className="m-[8px_0_0_0] text-[#64748b] dark:text-slate-400 text-[0.95rem]">Create a 6-digit PIN to secure your account logins.</p>
        </div>

        {error && (
          <div className="bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 p-[12px] rounded-[8px] text-[0.9rem] font-bold text-center border border-[#fecaca] dark:border-rose-900/50">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-[16px]">
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Enter 6-Digit PIN</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                maxLength="6"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full p-[16px_40px_16px_16px] text-[1.5rem] tracking-[12px] text-center font-black text-[#00212e] dark:text-white bg-[#f8fafc] dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-700 rounded-[8px] transition-colors outline-none focus:border-[#00a8e8] box-border"
              />
              <button type="button" className="absolute right-[16px] top-[20px] bg-transparent border-none text-[#94a3b8] dark:text-slate-500 cursor-pointer hover:text-[#00212e] dark:hover:text-white p-0" onClick={() => setShowPin(!showPin)} tabIndex="-1">
                {showPin ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Confirm PIN</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                maxLength="6"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • • • •"
                className="w-full p-[16px_40px_16px_16px] text-[1.5rem] tracking-[12px] text-center font-black text-[#00212e] dark:text-white bg-[#f8fafc] dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-700 rounded-[8px] transition-colors outline-none focus:border-[#00a8e8] box-border"
              />
              <button type="button" className="absolute right-[16px] top-[20px] bg-transparent border-none text-[#94a3b8] dark:text-slate-500 cursor-pointer hover:text-[#00212e] dark:hover:text-white p-0" onClick={() => setShowPin(!showPin)} tabIndex="-1">
                {showPin ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex gap-[12px] mt-[8px]">
          <button className="flex-1 p-[14px] bg-white dark:bg-slate-800 text-[#475569] dark:text-slate-300 border border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[1rem] cursor-pointer hover:bg-[#f1f5f9] dark:hover:bg-slate-700 transition-colors" onClick={onCancel}>Cancel</button>
          <button className="flex-1 p-[14px] bg-[#10b981] text-white border-none rounded-[8px] font-bold text-[1rem] cursor-pointer hover:bg-[#059669] hover:-translate-y-[1px] transition-all shadow-[0_4px_12px_rgba(16,185,129,0.25)]" onClick={handleConfirm}>Enable Security</button>
        </div>
      </div>
    </div>
  );
};

export default TwoFAModal;