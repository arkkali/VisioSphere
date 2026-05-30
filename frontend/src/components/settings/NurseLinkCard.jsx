import { useState } from 'react';

const NurseLinkCard = ({ linkedNurseId, enableSidebarToggle, onLink, onUnlink, onToggleSidebar }) => {
  const [nurseIdInput, setNurseIdInput] = useState('');

  const handleLink = () => {
    onLink(nurseIdInput, () => setNurseIdInput(''));
  };

  const handleToggleSidebar = (checked) => {
    onToggleSidebar(checked);
    window.dispatchEvent(new Event('localStorageUpdate'));
  };

  const handleUnlink = () => {
    onUnlink();
    window.dispatchEvent(new Event('localStorageUpdate'));
  };

  return (
    <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
      <div className="p-[20px_24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
        <h3 className="m-0 text-[1.2rem] text-[#00212e] dark:text-white font-extrabold">Nurse Account Linking</h3>
      </div>
      <div className="p-[24px] flex flex-col gap-[20px]">
        <p className="text-[0.95rem] text-[#64748b] dark:text-slate-400 m-0">Link a Nurse profile to quickly switch roles without logging out.</p>

        {!linkedNurseId ? (
          <div className="flex flex-col md:flex-row gap-[12px] items-end">
            <div className="flex flex-col gap-[8px] flex-1 w-full">
              <label className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Nurse ID</label>
              <input
                type="text"
                placeholder="e.g., N-202601"
                value={nurseIdInput}
                onChange={(e) => setNurseIdInput(e.target.value.toUpperCase())}
                className="w-full p-[12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] font-medium text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors box-border"
              />
            </div>
            <button onClick={handleLink} className="p-[14px_24px] bg-[#00212e] dark:bg-[#00a8e8] text-white border-none rounded-[8px] font-bold text-[0.95rem] cursor-pointer hover:bg-[#00435c] dark:hover:bg-[#0088b8] transition-colors w-full md:w-auto h-fit">Link Account</button>
          </div>
        ) : (
          <div className="flex flex-col gap-[20px] p-[20px] bg-[#f8fafc] dark:bg-slate-900/50 border border-[#cbd5e1] dark:border-slate-700 rounded-[12px]">
            <div className="flex justify-between items-center flex-wrap gap-[12px]">
              <div>
                <span className="block text-[0.8rem] text-[#64748b] dark:text-slate-400 font-bold uppercase tracking-[0.5px] mb-[4px]">Currently Linked Nurse</span>
                <span className="text-[1.2rem] font-extrabold text-[#00a8e8] dark:text-[#38bdf8] bg-[#e0f2fe] dark:bg-[#0284c7]/20 px-[12px] py-[4px] rounded-[6px]">{linkedNurseId}</span>
              </div>
              <button onClick={handleUnlink} className="p-[8px_16px] bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400 border border-[#fecaca] dark:border-rose-900/50 rounded-[6px] font-bold text-[0.85rem] cursor-pointer hover:bg-[#fee2e2] dark:hover:bg-rose-900/40 transition-colors">Unlink Account</button>
            </div>

            <div className="h-[1px] bg-[#e2e8f0] dark:bg-slate-700 w-full"></div>

            <div className="flex justify-between items-center flex-wrap gap-[12px]">
              <div className="flex flex-col gap-[4px]">
                <span className="font-bold text-[#00212e] dark:text-white text-[1rem]">Enable Sidebar Role Switcher</span>
                <span className="text-[#64748b] dark:text-slate-400 text-[0.85rem]">Show the toggle in the sidebar to switch views instantly.</span>
              </div>
              <label className="relative inline-block w-[52px] h-[28px]">
                <input type="checkbox" className="opacity-0 w-0 h-0 peer" checked={enableSidebarToggle} onChange={(e) => handleToggleSidebar(e.target.checked)} />
                <span className="absolute cursor-pointer top-0 left-0 right-0 bottom-0 bg-[#cbd5e1] dark:bg-slate-600 transition-colors duration-300 rounded-[28px] before:absolute before:content-[''] before:h-[22px] before:w-[22px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-transform before:duration-300 before:rounded-full peer-checked:bg-[#00a8e8] peer-checked:before:translate-x-[24px]"></span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NurseLinkCard;