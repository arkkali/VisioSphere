import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
// WebP at the size it is actually painted. The PNG original is untouched in
// src/assets: it is 1715x482 and 153 KiB, drawn here 180 CSS px wide, and
// Lighthouse charged the full 153 KiB to "Properly size images" on every
// authenticated page — this sidebar is on all of them. Now 15 KiB.
import visioLogo from '../assets/visio-360.webp';
import { clearSession } from '../utils/browserSession';

const readToggle = () => localStorage.getItem('enableSidebarToggle') === 'true';
const readLinkedNurse = () => localStorage.getItem('linkedNurseId') || '';

const Sidebar = () => {
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isToggleEnabled, setIsToggleEnabled] = useState(readToggle);
  const [linkedNurseId, setLinkedNurseId] = useState(readLinkedNurse);
  const location = useLocation();
  const navigate = useNavigate();

  const isNurseView = location.pathname.startsWith('/nurse');
  const basePath = isNurseView ? '/nurse' : '/admin';
  const showToggle = !!linkedNurseId && isToggleEnabled;

  useEffect(() => {
    const sync = () => {
      setIsToggleEnabled(readToggle());
      setLinkedNurseId(readLinkedNurse());
    };
    window.addEventListener('storage', sync);
    window.addEventListener('localStorageUpdate', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('localStorageUpdate', sync);
    };
  }, []); 
  const handleSignOut = () => {
    // clearSession() rather than localStorage.clear(): the theme and the
    // remembered sign-in are device preferences the user set on purpose and
    // must survive signing out. See utils/browserSession.js.
    clearSession();
    window.location.href = '/';
  };

  const handleSwitchView = () => {
    if (isNurseView) {
      navigate('/admin');
    } else {
      navigate('/nurse');
    }
  };

  const closeMobileSidebar = () => setMobileOpen(false);

  return (
    <>
      <style>{`
        @keyframes slideDownFade {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <button
        type="button"
        aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setMobileOpen((open) => !open)}
        className="md:hidden fixed left-[14px] top-[14px] z-[1100] w-[42px] h-[42px] rounded-[8px] border border-slate-600 bg-slate-900 text-white shadow-lg"
      >
        <span className="text-[1.4rem] leading-none">{mobileOpen ? '×' : '☰'}</span>
      </button>
      {mobileOpen && <button type="button" aria-label="Close navigation menu" onClick={closeMobileSidebar} className="md:hidden fixed inset-0 z-[950] bg-slate-950/60" />}
      <div className={`w-[250px] h-screen bg-[#e1f4fd] dark:bg-slate-900 border-r border-transparent dark:border-slate-800 fixed left-0 top-0 flex flex-col z-[1000] box-border shadow-[2px_0_10px_rgba(0,0,0,0.03)] transition-all duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="pt-[30px] px-[24px] pb-[10px] flex items-center justify-center w-full box-border">
          <img src={visioLogo} alt="VisioSphere Logo" width={360} height={101} className="max-w-[180px] h-auto object-contain dark:brightness-200 dark:contrast-200 transition-all duration-300" />
        </div>

        {showToggle && (
          <div className="flex items-center justify-center mb-[20px] mt-0 w-full">
            <button
              onClick={handleSwitchView}
              className="w-[64px] h-[32px] rounded-[32px] bg-[#90e0ff] dark:bg-slate-800 border-2 border-primary-blue dark:border-slate-600 relative cursor-pointer outline-none transition-all duration-300 flex items-center px-[4px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)]"
              title={isNurseView ? 'Switch to Admin View' : 'Switch to Nurse View'}
            >
              <div className={`w-[24px] h-[24px] bg-white dark:bg-slate-300 rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.15)] flex items-center justify-center transition-transform duration-300 absolute ${isNurseView ? 'translate-x-[32px]' : 'translate-x-0'}`}>
                {isNurseView ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#00a8e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px]">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line>
                    <line x1="22" y1="11" x2="16" y2="11"></line>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#003543" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[14px] h-[14px] dark:stroke-slate-900">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                  </svg>
                )}
              </div>
            </button>
          </div>
        )}

        <nav onClick={closeMobileSidebar} className="flex-1 flex flex-col gap-[10px] px-[16px] overflow-y-auto">
          <NavLink to={basePath} end onClick={closeMobileSidebar} className={({ isActive }) => `group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
            {({ isActive }) => (
              <>
                <div className="flex flex-col leading-[1.3]">
                  <span className={`font-extrabold text-[0.95rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>{isNurseView ? 'Nurse' : 'Admin'}</span>
                  <span className={`font-normal text-[0.8rem] transition-colors duration-200 ${isActive ? 'text-white/85' : 'text-[#475569] dark:text-slate-400'}`}>Hub</span>
                </div>
                <div className={`w-[14px] h-[14px] border-[2.5px] border-white rounded-full ${isActive ? 'block' : 'hidden'}`}></div>
              </>
            )}
          </NavLink>

          <div className="flex flex-col">
            <button
              className="group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left hover:bg-[#00a8e814] dark:hover:bg-slate-800"
              onClick={() => setAccountsOpen(!accountsOpen)}
            >
              <div className="flex flex-col leading-[1.3]">
                <span className="font-extrabold text-[0.95rem] text-[#003543] dark:text-slate-200 transition-colors duration-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]">Account</span>
                <span className="font-normal text-[0.8rem] text-[#475569] dark:text-slate-400 transition-colors duration-200">Management</span>
              </div>
              <svg className={`w-[18px] h-[18px] text-[#003543] dark:text-slate-400 transition-transform duration-300 ${accountsOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>

            {accountsOpen && (
              <div className="flex flex-col pl-[24px] gap-[4px] mt-[4px] mb-[8px] animate-[slideDownFade_0.2s_ease_forwards]">
                {!isNurseView && (
                  <NavLink to={`${basePath}/nurses`} className={({ isActive }) => `py-[10px] px-[16px] no-underline text-[0.85rem] rounded-[8px] transition-all duration-200 ${isActive ? 'text-[#0284c7] dark:text-[#38bdf8] font-extrabold bg-[#0284c71a] dark:bg-slate-800' : 'text-[#475569] dark:text-slate-400 font-semibold hover:text-[#0284c7] dark:hover:text-[#38bdf8] hover:bg-[#0284c70d] dark:hover:bg-slate-800 hover:pl-[20px]'}`}>
                    Nurses
                  </NavLink>
                )}
                <NavLink to={`${basePath}/elders`} className={({ isActive }) => `py-[10px] px-[16px] no-underline text-[0.85rem] rounded-[8px] transition-all duration-200 ${isActive ? 'text-[#0284c7] dark:text-[#38bdf8] font-extrabold bg-[#0284c71a] dark:bg-slate-800' : 'text-[#475569] dark:text-slate-400 font-semibold hover:text-[#0284c7] dark:hover:text-[#38bdf8] hover:bg-[#0284c70d] dark:hover:bg-slate-800 hover:pl-[20px]'}`}>Elders</NavLink>
                <NavLink to={`${basePath}/guardians`} className={({ isActive }) => `py-[10px] px-[16px] no-underline text-[0.85rem] rounded-[8px] transition-all duration-200 ${isActive ? 'text-[#0284c7] dark:text-[#38bdf8] font-extrabold bg-[#0284c71a] dark:bg-slate-800' : 'text-[#475569] dark:text-slate-400 font-semibold hover:text-[#0284c7] dark:hover:text-[#38bdf8] hover:bg-[#0284c70d] dark:hover:bg-slate-800 hover:pl-[20px]'}`}>Guardians</NavLink>
              </div>
            )}
          </div>

          <NavLink to={`${basePath}/monitoring`} className={({ isActive }) => `group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
            {({ isActive }) => (
              <>
                <div className="flex flex-col leading-[1.3]">
                  <span className={`font-extrabold text-[0.95rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>CCTV</span>
                  <span className={`font-normal text-[0.8rem] transition-colors duration-200 ${isActive ? 'text-white/85' : 'text-[#475569] dark:text-slate-400'}`}>Live Hub</span>
                </div>
                <div className={`w-[14px] h-[14px] border-[2.5px] border-white rounded-full ${isActive ? 'block' : 'hidden'}`}></div>
              </>
            )}
          </NavLink>

          <NavLink to={`${basePath}/video-clips`} className={({ isActive }) => `group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
            {({ isActive }) => (
              <>
                <div className="flex flex-col leading-[1.3]">
                  <span className={`font-extrabold text-[0.95rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>Video Clips</span>
                  <span className={`font-normal text-[0.8rem] transition-colors duration-200 ${isActive ? 'text-white/85' : 'text-[#475569] dark:text-slate-400'}`}>Event Replays</span>
                </div>
                <div className={`w-[14px] h-[14px] border-[2.5px] border-white rounded-full ${isActive ? 'block' : 'hidden'}`}></div>
              </>
            )}
          </NavLink>

          <NavLink to={`${basePath}/assessments`} className={({ isActive }) => `group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
            {({ isActive }) => (
              <>
                <div className="flex flex-col leading-[1.3]">
                  <span className={`font-extrabold text-[0.95rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>Daily Assessments</span>
                  <span className={`font-normal text-[0.8rem] transition-colors duration-200 ${isActive ? 'text-white/85' : 'text-[#475569] dark:text-slate-400'}`}>& Reports</span>
                </div>
                <div className={`w-[14px] h-[14px] border-[2.5px] border-white rounded-full ${isActive ? 'block' : 'hidden'}`}></div>
              </>
            )}
          </NavLink>

          {!isNurseView && (
            <NavLink to={`${basePath}/audit`} className={({ isActive }) => `group flex items-center justify-between py-[12px] px-[16px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
              {({ isActive }) => (
                <>
                  <div className="flex flex-col leading-[1.3]">
                    <span className={`font-extrabold text-[0.95rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>Audit Trail</span>
                    <span className={`font-normal text-[0.8rem] transition-colors duration-200 ${isActive ? 'text-white/85' : 'text-[#475569] dark:text-slate-400'}`}>& Logs</span>
                  </div>
                  <div className={`w-[14px] h-[14px] border-[2.5px] border-white rounded-full ${isActive ? 'block' : 'hidden'}`}></div>
                </>
              )}
            </NavLink>
          )}
        </nav>

        <div className="pt-[20px] px-[16px] pb-[30px] flex flex-col gap-[8px] items-center border-t border-transparent dark:border-slate-800 mt-auto transition-colors duration-300">
          <NavLink to={`${basePath}/settings`} className={({ isActive }) => `group flex items-center justify-between py-[10px] px-[18px] rounded-[12px] no-underline bg-transparent border-none cursor-pointer transition-all duration-200 w-full box-border text-left ${isActive ? 'bg-gradient-to-br from-[#38bdf8] to-[#0284c7] shadow-[0_4px_12px_rgba(2,132,199,0.3)]' : 'hover:bg-[#00a8e814] dark:hover:bg-slate-800'}`}>
            {({ isActive }) => (
              <span className={`font-bold text-[0.9rem] transition-colors duration-200 ${isActive ? 'text-white' : 'text-[#003543] dark:text-slate-200 group-hover:text-primary-blue dark:group-hover:text-[#38bdf8]'}`}>System Settings</span>
            )}
          </NavLink>

          {/* White on #38bdf8 measured 2.14:1 — the worst contrast failure on the
              dashboard, on the one control nobody can afford to misread. Darkened
              to #0075a2 (5.16:1), a blue already used elsewhere in this app, so
              white text stays. Dark mode: #0369a1 (5.93:1). Hover deepens further
              rather than lightening, which is what broke it before — the old
              hover:bg-[#0284c7] was 4.10:1, still short. */}
          <button className="flex items-center justify-center gap-[10px] bg-[#0075a2] dark:bg-[#0369a1] text-white border-none p-[12px] rounded-[24px] font-bold text-[0.95rem] cursor-pointer mt-[15px] transition-all duration-200 shadow-[0_4px_10px_rgba(0,117,162,0.3)] dark:shadow-[0_4px_10px_rgba(3,105,161,0.4)] w-full hover:bg-[#00688f] dark:hover:bg-[#025c8f] hover:-translate-y-[2px] hover:shadow-[0_6px_14px_rgba(0,104,143,0.35)] active:translate-y-0" onClick={handleSignOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sign Out
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;