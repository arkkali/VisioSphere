import { useState } from 'react';

const ProfileCard = ({ displayName, theme, onDisplayNameChange, onThemeChange, onSave }) => {
  const [localName, setLocalName] = useState(displayName);
  const [localTheme, setLocalTheme] = useState(theme);

  const handleSave = () => {
    onDisplayNameChange(localName);
    onThemeChange(localTheme);
    onSave(localName, localTheme);
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
      <div className="p-[20px_24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
        <h3 className="m-0 text-[1.2rem] text-[#00212e] dark:text-white font-extrabold">Profile Details</h3>
      </div>
      <div className="p-[24px] flex flex-col gap-[20px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Display Name</label>
            <input
              type="text"
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              className="p-[12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] font-medium text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors"
            />
          </div>
          <div className="flex flex-col gap-[8px]">
            <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Interface Theme</label>
            <select
              value={localTheme}
              onChange={(e) => setLocalTheme(e.target.value)}
              className="p-[12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] font-medium text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors cursor-pointer appearance-none bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%2300212e%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] dark:bg-[url('data:image/svg+xml,%3Csvg_xmlns=%22http://www.w3.org/2000/svg%22_width=%2212%22_height=%228%22_viewBox=%220_0_12_8%22%3E%3Cpath_fill=%22%23ffffff%22_d=%22M1_1l5_5_5-5%22/%3E%3C/svg%3E')] bg-no-repeat bg-[right_16px_center]"
            >
              <option value="light">Light Mode</option>
              <option value="dark">Dark Mode</option>
              <option value="default">System Default</option>
            </select>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="self-end p-[12px_24px] bg-[#00a8e8] text-white border-none rounded-[8px] font-bold text-[0.95rem] cursor-pointer hover:bg-[#0088b8] shadow-[0_4px_12px_rgba(0,168,232,0.25)] transition-all"
        >
          Save Profile Changes
        </button>
      </div>
    </div>
  );
};

export default ProfileCard;