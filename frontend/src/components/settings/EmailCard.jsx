import { useState } from 'react';

/**
 * Account email, and the OTP-verified route to changing it.
 *
 * Admin.email is required at account creation, so an admin always has one --
 * but the seeded accounts carry placeholder addresses that nobody can receive
 * mail at, which silently breaks "Forgot password?" (the reset code is sent to
 * whatever is on file). This card is how an admin replaces it with an address
 * they own.
 *
 * The two-step shape is the point, not ceremony: the backend parks the new
 * address in `pendingEmail` and only promotes it once a code mailed TO that
 * address comes back. Nothing here is applied by pressing Save.
 */
const EmailCard = ({ currentEmail, onRequestCode, onVerifyCode, onMessage }) => {
  // 'idle' = showing the address | 'editing' = typing a new one | 'verifying' = entering the code
  const [stage, setStage] = useState('idle');
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setStage('idle');
    setNewEmail('');
    setCode('');
    setError('');
  };

  const handleSendCode = async () => {
    const email = newEmail.trim();
    if (!email) {
      setError('Enter the email address you want to use.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onRequestCode(email);
      setStage('verifying');
      onMessage?.(`Verification code sent to ${email}.`);
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not send the verification code.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    const entered = code.trim();
    if (entered.length !== 6) {
      setError('Enter the 6-digit code from the email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onVerifyCode(entered);
      reset();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not verify that code.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "p-[12px_16px] bg-white dark:bg-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] text-[1rem] font-medium text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] dark:focus:border-[#00a8e8] transition-colors";

  const primaryBtn =
    "p-[12px_24px] bg-[#00a8e8] text-white border-none rounded-[8px] font-bold text-[0.95rem] cursor-pointer hover:bg-[#0088b8] shadow-[0_4px_12px_rgba(0,168,232,0.25)] transition-all disabled:opacity-60";

  const quietBtn =
    "p-[12px_24px] bg-transparent text-[#475569] dark:text-slate-300 border-[2px] border-[#cbd5e1] dark:border-slate-600 rounded-[8px] font-bold text-[0.95rem] cursor-pointer hover:border-[#94a3b8] transition-all disabled:opacity-60";

  return (
    <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
      <div className="p-[20px_24px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50">
        <h2 className="m-0 text-[1.2rem] text-[#00212e] dark:text-white font-extrabold">Email Address</h2>
      </div>

      <div className="p-[24px] flex flex-col gap-[20px]">
        <div className="flex flex-col gap-[8px]">
          <span className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">
            Current Address
          </span>
          <p className="m-0 text-[1rem] font-semibold text-[#00212e] dark:text-white break-all">
            {currentEmail || 'Not set'}
          </p>
          <p className="m-0 text-[0.85rem] text-[#475569] dark:text-slate-400">
            Password reset codes are sent here. If this is not an address you can open,
            change it &mdash; otherwise you will not be able to recover this account.
          </p>
        </div>

        {stage === 'idle' && (
          <button type="button" onClick={() => setStage('editing')} className={`self-end ${primaryBtn}`}>
            Change Email
          </button>
        )}

        {stage === 'editing' && (
          <div className="flex flex-col gap-[12px]">
            <label
              htmlFor="settings-new-email"
              className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]"
            >
              New Email Address
            </label>
            <input
              id="settings-new-email"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
              className={inputClass}
            />
            <p className="m-0 text-[0.85rem] text-[#475569] dark:text-slate-400">
              We will send a 6-digit code to this address. Your email only changes once you enter it.
            </p>
            <div className="flex gap-[12px] self-end">
              <button type="button" onClick={reset} disabled={busy} className={quietBtn}>
                Cancel
              </button>
              <button type="button" onClick={handleSendCode} disabled={busy} className={primaryBtn}>
                {busy ? 'Sending...' : 'Send Code'}
              </button>
            </div>
          </div>
        )}

        {stage === 'verifying' && (
          <div className="flex flex-col gap-[12px]">
            <label
              htmlFor="settings-email-otp"
              className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]"
            >
              Verification Code
            </label>
            <input
              id="settings-email-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              disabled={busy}
              className={`${inputClass} tracking-[6px] text-center`}
            />
            <p className="m-0 text-[0.85rem] text-[#475569] dark:text-slate-400">
              Sent to <strong className="break-all">{newEmail}</strong>. The code expires in 10 minutes.
            </p>
            <div className="flex gap-[12px] self-end">
              <button
                type="button"
                onClick={() => { setStage('editing'); setCode(''); setError(''); }}
                disabled={busy}
                className={quietBtn}
              >
                Use Another Address
              </button>
              <button type="button" onClick={handleVerify} disabled={busy} className={primaryBtn}>
                {busy ? 'Verifying...' : 'Verify & Save'}
              </button>
            </div>
          </div>
        )}

        {/* role="alert" so the failure is announced, not just painted. */}
        {error && (
          <p role="alert" className="m-0 text-[0.9rem] font-semibold text-[#be123c] dark:text-[#fb7185]">
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default EmailCard;
