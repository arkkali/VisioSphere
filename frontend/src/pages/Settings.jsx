import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import ProfileCard from '../components/settings/ProfileCard';
import PasswordCard from '../components/settings/PasswordCard';
import TwoFACard from '../components/settings/TwoFACard';
import NurseLinkCard from '../components/settings/NurseLinkCard';
import DangerZone from '../components/settings/DangerZone';
import DataPrivacyTab from '../components/settings/DataPrivacyTab';
import { logAudit } from '../services/auditService';
import {
  fetchAdminProfile,
  fetchLinkedNurseProfile,
  saveAdminProfile,
  saveNurseProfile,
  changeAdminPassword,
  changeNursePassword,
  toggle2FA,
  toggleNurse2FA,
  linkNurseAccount,
  unlinkNurseAccount,
  deactivateAccount,
} from '../services/settingsService';

const getAdminId = () => localStorage.getItem('adminId') || '';

const Settings = () => {
  const { setTheme: setGlobalTheme } = useTheme();
  const location = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');
  const messageTimerRef = useRef(null);

  const [activeTab, setActiveTab] = useState('account');
  const [activeModal, setActiveModal] = useState(null);
  const [saveMessage, setSaveMessage] = useState({ text: '', type: '' });
  const [isLoading, setIsLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [theme, setTheme] = useState('default');
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [linkedNurseId, setLinkedNurseId] = useState('');
  const [resolvedNurseId, setResolvedNurseId] = useState('');
  const [enableSidebarToggle, setEnableSidebarToggle] = useState(false);

  const showMessage = (text, type = 'success') => {
    setSaveMessage({ text, type });
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    messageTimerRef.current = setTimeout(() => setSaveMessage({ text: '', type: '' }), 4000);
  };

  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      if (isNurseView) {
        const storedLinkedId = localStorage.getItem('linkedNurseId') || '';
        const storedToggle = localStorage.getItem('enableSidebarToggle') === 'true';
        const storedTheme = localStorage.getItem('appTheme') || 'default';

        setLinkedNurseId(storedLinkedId);
        setEnableSidebarToggle(storedToggle);
        setTheme(storedTheme);
        setGlobalTheme(storedTheme);
        setResolvedNurseId(storedLinkedId);

        const adminId = getAdminId();
        if (storedLinkedId && adminId) {
          try {
            const nurseData = await fetchLinkedNurseProfile(adminId);
            setDisplayName(`${nurseData.firstName} ${nurseData.lastName}`);
            setResolvedNurseId(nurseData.nurseId || storedLinkedId);
            setIs2FAEnabled(nurseData.is2FAEnabled || false);
          } catch {
            setDisplayName(localStorage.getItem('linkedNurseName') || 'Nurse Profile');
          }
        } else {
          const standaloneNurseId = localStorage.getItem('nurseId') || '';
          setResolvedNurseId(standaloneNurseId);
          setDisplayName(localStorage.getItem('userName') || 'Nurse Profile');

          if (standaloneNurseId) {
            try {
              const { data } = await import('../api/axiosInstance').then(m => m.default.get(`/nurses/${standaloneNurseId}`));
              setIs2FAEnabled(data.is2FAEnabled || false);
            } catch {
              setIs2FAEnabled(false);
            }
          }
        }

        setIsLoading(false);
        return;
      }

      const adminId = getAdminId();

      try {
        const raw = await fetchAdminProfile(adminId);
        const adminData = raw.adminData ?? raw;
        const adminTheme = adminData.theme || 'default';
        const admin2FA = adminData.is2FAEnabled || false;

        localStorage.setItem('appTheme', adminTheme);
        setGlobalTheme(adminTheme);
        setIs2FAEnabled(admin2FA);

        const storedLinkedId = adminData.linkedNurseId || '';
        setLinkedNurseId(storedLinkedId);

        if (storedLinkedId) {
          localStorage.setItem('linkedNurseId', storedLinkedId);
          localStorage.setItem('linkedNurseName', adminData.linkedNurseName || '');
        } else {
          localStorage.removeItem('linkedNurseId');
          localStorage.removeItem('linkedNurseName');
        }

        const sidebarEnabled = adminData.enableSidebarToggle === true;
        setEnableSidebarToggle(sidebarEnabled);
        localStorage.setItem('enableSidebarToggle', String(sidebarEnabled));

        setDisplayName(adminData.name || '');
        setTheme(adminTheme);
      } catch {
        showMessage('Failed to load profile settings.', 'error');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveProfile = async (newName, newTheme) => {
    const adminId = getAdminId();

    try {
      if (isNurseView && resolvedNurseId) {
        await saveNurseProfile(resolvedNurseId, { name: newName, theme: newTheme });
        setDisplayName(newName);
        await logAudit({
          category: 'Account Management',
          event: 'Nurse Profile Updated',
          purpose: 'Nurse profile updated via linked Admin session',
          status: 'success',
          newValues: { name: newName },
        });
        showMessage('Profile settings updated successfully!');
        return;
      }

      await saveAdminProfile(adminId, { name: newName, theme: newTheme });
      localStorage.setItem('adminName', newName);
      localStorage.setItem('userName', newName);
      localStorage.setItem('appTheme', newTheme);
      setDisplayName(newName);
      setTheme(newTheme);
      setGlobalTheme(newTheme);
      await logAudit({
        category: 'Account Management',
        event: 'Admin Profile Updated',
        purpose: 'Admin updated profile settings via Settings page',
        status: 'success',
        newValues: { name: newName, theme: newTheme },
      });
      showMessage('Profile settings updated successfully!');
    } catch {
      showMessage('Error saving profile.', 'error');
    }
  };

  const handleChangePassword = async (passwords, resetFields) => {
    const { currentPassword, newPassword, confirmPassword } = passwords;

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('Please fill in all password fields.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage('New passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < 6) {
      showMessage('New password must be at least 6 characters.', 'error');
      return;
    }

    const adminId = getAdminId();

    try {
      if (isNurseView && resolvedNurseId) {
        await changeNursePassword(resolvedNurseId, currentPassword, newPassword);
        resetFields();
        await logAudit({
          category: 'Account Management',
          event: 'Nurse Password Changed',
          purpose: 'Nurse password changed via linked Admin session',
          status: 'success',
        });
        showMessage('Password changed successfully!');
        return;
      }

      await changeAdminPassword(adminId, currentPassword, newPassword);
      resetFields();
      await logAudit({
        category: 'Account Management',
        event: 'Admin Password Changed',
        purpose: 'Admin changed password via Settings page',
        status: 'success',
      });
      showMessage('Password changed successfully!');
    } catch (err) {
      showMessage(err.response?.data?.message || 'Error changing password.', 'error');
    }
  };

  const handleToggle2FA = async (enable, errorMsg, pin = null) => {
    if (errorMsg) {
      showMessage(errorMsg, 'error');
      return;
    }

    try {
      if (isNurseView && !linkedNurseId) {
        const nurseId = localStorage.getItem('nurseId') || '';
        await toggleNurse2FA(nurseId, enable, pin ?? null);
        setIs2FAEnabled(enable);
        await logAudit({
          category: 'Account Management',
          event: enable ? '2FA Enabled' : '2FA Disabled',
          purpose: `Standalone nurse ${enable ? 'enabled' : 'disabled'} two-factor authentication via Settings page`,
          status: 'success',
          newValues: { is2FAEnabled: String(enable) },
        });
      } else {
        const adminId = getAdminId();
        await toggle2FA(adminId, enable, pin ?? null);
        setIs2FAEnabled(enable);
        await logAudit({
          category: 'Account Management',
          event: enable ? '2FA Enabled' : '2FA Disabled',
          purpose: `Admin ${enable ? 'enabled' : 'disabled'} two-factor authentication via Settings page`,
          status: 'success',
          newValues: { is2FAEnabled: String(enable) },
        });
      }
      showMessage(enable ? '2FA Enabled Successfully!' : '2FA Disabled Successfully.');
    } catch (err) {
      showMessage(err.response?.data?.message || 'Error updating 2FA.', 'error');
    }
  };

  const handleLinkNurse = async (nurseIdInput, resetInput) => {
    const adminId = getAdminId();
    if (!nurseIdInput.trim()) {
      showMessage('Please enter a Nurse ID.', 'error');
      return;
    }
    try {
      const response = await linkNurseAccount(adminId, nurseIdInput.trim());
      const newLinkedId = response.linkedNurseId || nurseIdInput.trim();
      setLinkedNurseId(newLinkedId);
      localStorage.setItem('linkedNurseId', newLinkedId);
      window.dispatchEvent(new Event('localStorageUpdate'));
      resetInput();
      await logAudit({
        category: 'Account Management',
        event: 'Nurse Account Linked',
        purpose: `Admin linked nurse account: ${nurseIdInput.trim()}`,
        status: 'success',
        newValues: { linkedNurseId: nurseIdInput.trim() },
      });
      showMessage('Nurse account linked successfully!');
    } catch (err) {
      showMessage(err.response?.data?.message || 'Failed to link nurse account.', 'error');
    }
  };

  const handleUnlinkNurse = async () => {
    const adminId = getAdminId();
    try {
      await unlinkNurseAccount(adminId);
      setLinkedNurseId('');
      setEnableSidebarToggle(false);
      localStorage.setItem('enableSidebarToggle', 'false');
      localStorage.removeItem('linkedNurseId');
      localStorage.removeItem('linkedNurseName');
      window.dispatchEvent(new Event('localStorageUpdate'));
      await logAudit({
        category: 'Account Management',
        event: 'Nurse Account Unlinked',
        purpose: 'Admin unlinked nurse account via Settings page',
        status: 'success',
      });
      showMessage('Nurse account unlinked.');
    } catch {
      showMessage('Failed to unlink nurse account.', 'error');
    }
  };

  const handleToggleSidebarFeature = async (checked) => {
    const adminId = getAdminId();
    setEnableSidebarToggle(checked);
    localStorage.setItem('enableSidebarToggle', String(checked));
    window.dispatchEvent(new Event('localStorageUpdate'));
    try {
      await saveAdminProfile(adminId, { enableSidebarToggle: checked });
    } catch {
      showMessage('Failed to save sidebar preference.', 'error');
    }
  };

  const handleDeactivateAccount = async () => {
    const adminId = getAdminId();
    if (isNurseView) {
      showMessage('Account deactivation requires Administrator approval.', 'error');
      setActiveModal(null);
      return;
    }
    try {
      await logAudit({
        category: 'Account Management',
        event: 'Admin Account Deactivated',
        purpose: 'Admin self-deactivated account via Settings page',
        status: 'alert',
      });
      await deactivateAccount(adminId);
      localStorage.clear();
      window.location.href = '/login';
    } catch {
      showMessage('Failed to deactivate account. Please contact support.', 'error');
      setActiveModal(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex bg-[#f8fafc] dark:bg-slate-900 min-h-screen w-screen transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-[16px] md:p-[30px] flex justify-center items-center">
          <div className="text-[1.2rem] text-[#64748b] dark:text-slate-400 font-medium">Loading Settings...</div>
        </main>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes slideInRight { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tab-icon::before {
          content: ''; display: inline-block; width: 18px; height: 18px; margin-right: 12px; background: currentColor; border-radius: 3px; vertical-align: text-bottom;
        }
        .account-icon::before {
          -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>') center / contain no-repeat;
          mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>') center / contain no-repeat;
        }
        .data-icon::before {
          -webkit-mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>') center / contain no-repeat;
          mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>') center / contain no-repeat;
        }
      `}</style>

      <div className="flex bg-[#f8fafc] dark:bg-slate-900 min-h-screen w-screen font-['Outfit',sans-serif] overflow-x-hidden transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 ml-0 md:ml-[250px] p-[20px] md:p-[40px] max-w-[1400px] mx-auto">

          <div className="flex flex-col mb-[32px] pb-[20px] border-b border-[#e2e8f0] dark:border-slate-800">
            <h1 className="text-[2rem] md:text-[2.5rem] text-[#00212e] dark:text-white m-0 font-extrabold tracking-[-0.5px]">System Settings</h1>
            <p className="text-[1rem] text-[#64748b] dark:text-slate-400 m-[4px_0_0_0] font-medium">Manage your account preferences and global privacy policies.</p>
          </div>

          {saveMessage.text && (
            <div className={`fixed bottom-[24px] right-[24px] p-[16px_24px] text-white rounded-[8px] font-bold z-[1000] animate-[slideInRight_0.3s_ease] shadow-lg ${saveMessage.type === 'error' ? 'bg-[#e11d48] dark:bg-rose-600' : 'bg-[#10b981] dark:bg-emerald-600'}`}>
              {saveMessage.text}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-[24px] items-start">
            <div className="flex flex-col gap-[8px] bg-white dark:bg-slate-800 p-[16px] rounded-[16px] border border-[#e2e8f0] dark:border-slate-700 shadow-sm lg:sticky lg:top-[30px] transition-colors duration-300">
              <button
                className={`p-[14px_20px] rounded-[10px] font-extrabold text-[0.95rem] cursor-pointer transition-all duration-200 text-left flex items-center tab-icon account-icon border-none ${activeTab === 'account' ? 'bg-[#00a8e8] text-white shadow-[0_4px_12px_rgba(0,168,232,0.25)]' : 'bg-transparent text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 hover:text-[#00212e] dark:hover:text-white'}`}
                onClick={() => setActiveTab('account')}
              >
                Account Preferences
              </button>

              {!isNurseView && (
                <button
                  className={`p-[14px_20px] rounded-[10px] font-extrabold text-[0.95rem] cursor-pointer transition-all duration-200 text-left flex items-center tab-icon data-icon border-none ${activeTab === 'data' ? 'bg-[#00a8e8] text-white shadow-[0_4px_12px_rgba(0,168,232,0.25)]' : 'bg-transparent text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 hover:text-[#00212e] dark:hover:text-white'}`}
                  onClick={() => setActiveTab('data')}
                >
                  Data & Privacy
                </button>
              )}
            </div>

            <div className="flex flex-col gap-[24px]">

              {activeTab === 'account' && (
                <div className="animate-[fadeIn_0.3s_ease] flex flex-col gap-[24px]">

                  <ProfileCard
                    displayName={displayName}
                    theme={theme}
                    onDisplayNameChange={setDisplayName}
                    onThemeChange={setTheme}
                    onSave={handleSaveProfile}
                  />

                  <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
                    <div className="p-[20px_24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
                      <h3 className="m-0 text-[1.2rem] text-[#00212e] dark:text-white font-extrabold">Security & Authentication</h3>
                    </div>
                    <div className="p-[24px] flex flex-col gap-[32px]">
                      <PasswordCard onSubmit={handleChangePassword} />

                      <TwoFACard
                        is2FAEnabled={is2FAEnabled}
                        isNurseView={isNurseView}
                        isLinkedNurse={!!linkedNurseId}
                        onToggle={handleToggle2FA}
                        activeModal={activeModal}
                        onOpenModal={setActiveModal}
                        onCloseModal={() => setActiveModal(null)}
                      />
                    </div>
                  </div>

                  {!isNurseView && (
                    <NurseLinkCard
                      linkedNurseId={linkedNurseId}
                      enableSidebarToggle={enableSidebarToggle}
                      onLink={handleLinkNurse}
                      onUnlink={handleUnlinkNurse}
                      onToggleSidebar={handleToggleSidebarFeature}
                    />
                  )}

                  <DangerZone
                    activeModal={activeModal}
                    onOpenModal={setActiveModal}
                    onCloseModal={() => setActiveModal(null)}
                    onConfirmDeactivate={handleDeactivateAccount}
                  />
                </div>
              )}

              {!isNurseView && activeTab === 'data' && (
                <DataPrivacyTab onMessage={showMessage} />
              )}

            </div>
          </div>
        </main>
      </div>
    </>
  );
};

export default Settings;