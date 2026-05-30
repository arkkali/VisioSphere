import TwoFAModal from './TwoFAModal';

const TwoFACard = ({ is2FAEnabled, isNurseView, isLinkedNurse, onToggle, activeModal, onOpenModal, onCloseModal }) => {
  const isInherited = isNurseView && isLinkedNurse;

  const handleToggle = (checked) => {
    if (isInherited) {
      onToggle(null, '2FA settings are managed globally by the Administrator and cannot be changed from the Nurse perspective.');
      return;
    }
    if (checked) {
      onOpenModal('2fa');
    } else {
      onToggle(false, null);
    }
  };

  return (
    <>
      <div className="flex flex-col gap-[16px]">
        <div className="flex justify-between items-center border-b border-[#f1f5f9] dark:border-slate-700 pb-[8px]">
          <h4 className="m-0 text-[1rem] text-[#00212e] dark:text-white font-bold">Two-Factor Authentication (2FA)</h4>
          <span className={`text-[0.8rem] font-black uppercase tracking-[1px] px-[8px] py-[4px] rounded-[4px] ${is2FAEnabled ? 'bg-[#f0fdf4] dark:bg-emerald-900/30 text-[#10b981] dark:text-emerald-400' : 'bg-[#f1f5f9] dark:bg-slate-700 text-[#64748b] dark:text-slate-300'}`}>
            {is2FAEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
        <p className="text-[0.95rem] text-[#64748b] dark:text-slate-400 m-0">
          {isInherited
            ? 'This setting is inherited from the linked Administrator account and cannot be changed here.'
            : 'Require a secure 6-digit PIN code during every login attempt.'}
        </p>
        <div className="flex items-center gap-[12px]">
          <label className={`relative inline-block w-[52px] h-[28px] ${isInherited ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="checkbox"
              className="opacity-0 w-0 h-0 peer"
              checked={is2FAEnabled}
              onChange={(e) => handleToggle(e.target.checked)}
              disabled={isInherited}
            />
            <span className="absolute cursor-pointer top-0 left-0 right-0 bottom-0 bg-[#cbd5e1] dark:bg-slate-600 transition-colors duration-300 rounded-[28px] before:absolute before:content-[''] before:h-[22px] before:w-[22px] before:left-[3px] before:bottom-[3px] before:bg-white before:transition-transform before:duration-300 before:rounded-full peer-checked:bg-[#10b981] dark:peer-checked:bg-[#059669] peer-checked:before:translate-x-[24px]"></span>
          </label>
          {isInherited && (
            <span className="text-[0.8rem] text-[#94a3b8] dark:text-slate-500 font-medium">Inherited from Admin</span>
          )}
        </div>
      </div>
      {activeModal === '2fa' && (
        <TwoFAModal
          onConfirm={(pin) => {
            onToggle(true, null, pin);
            onCloseModal();
          }}
          onCancel={onCloseModal}
        />
      )}
    </>
  );
};

export default TwoFACard;