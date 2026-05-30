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

const PasswordCard = ({ onSubmit }) => {
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleSubmit = () => {
    onSubmit(passwords, () =>
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' })
    );
  };

  return (
    <div className="flex flex-col gap-[16px]">
      <h4 className="m-0 text-[1rem] text-[#00212e] dark:text-white font-bold border-b border-[#f1f5f9] dark:border-slate-700 pb-[8px]">Change Password</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[16px]">
        <div className="flex flex-col gap-[8px]">
          <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Current Password</label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={passwords.currentPassword}
              onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
              className="w-full p-[12px_40px_12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors box-border"
            />
            <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-[12px] top-[14px] bg-transparent border-none text-[#94a3b8] dark:text-slate-400 cursor-pointer hover:text-[#00212e] dark:hover:text-white p-0">
              {showCurrent ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-[8px]">
          <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">New Password</label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
              className="w-full p-[12px_40px_12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors box-border"
            />
            <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-[12px] top-[14px] bg-transparent border-none text-[#94a3b8] dark:text-slate-400 cursor-pointer hover:text-[#00212e] dark:hover:text-white p-0">
              {showNew ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-[8px]">
          <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Confirm New Password</label>
          <input
            type={showNew ? 'text' : 'password'}
            value={passwords.confirmPassword}
            onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
            className="w-full p-[12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors box-border"
          />
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="self-start p-[10px_20px] bg-white dark:bg-slate-800 border-[2px] border-[#00a8e8] text-[#00a8e8] rounded-[8px] font-bold text-[0.9rem] cursor-pointer hover:bg-[#f0f9ff] dark:hover:bg-slate-700 transition-colors"
      >
        Update Password
      </button>
    </div>
  );
};

export default PasswordCard;