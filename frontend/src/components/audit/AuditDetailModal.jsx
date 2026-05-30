import { getStatusText, statusClass } from './auditUtils';

const formatLogDetails = (log) => {
  if (!log) return '';
  const { event, actorName, actorRole, newValues, oldValues } = log;
  const rolePrefix = actorRole && actorRole !== 'System' ? `${actorRole} ` : '';
  const actorStr = `${rolePrefix}${actorName || 'Unknown'}`;

  if (event === 'Assessment Comment Added' && newValues) {
    const residentPart = newValues.residentName ? ` about ${newValues.residentName}` : '';
    const commentPart = newValues.commentPreview ? ` with "${newValues.commentPreview}"` : '';
    return `${actorStr} commented on an assessment${residentPart}${commentPart}.`;
  }

  if (event === 'Daily Report Submitted' && newValues) {
    const residentPart = newValues.residentName ? ` for ${newValues.residentName}` : '';
    return `${actorStr} submitted a daily assessment report${residentPart}.`;
  }

  if (event === 'Elder Assigned to Nurse' && newValues) {
    const residentPart = newValues.residentName || newValues.residentId || 'a resident';
    const nursePart = newValues.nurseName || newValues.nurseId || 'a nurse';
    return `${actorStr} assigned ${residentPart} to ${nursePart}.`;
  }

  if (event === 'Elder Linked to Guardian' && newValues) {
    const residentPart = newValues.residentName || newValues.residentId || 'a resident';
    const guardianPart = newValues.guardianName || newValues.guardianId || 'a guardian';
    return `${actorStr} linked ${residentPart} to ${guardianPart}.`;
  }

  if (event === 'Guardian Profile Updated' || event === 'Nurse Profile Updated') {
    return `${actorStr} updated a profile. Changes were successfully saved to the system.`;
  }

  if (event === 'Login' || event === 'Failed Login Attempt') {
    return `${actorStr} attempted to authenticate into the system. Result: ${log.status}.`;
  }

  const detailParts = [];
  if (newValues && Object.keys(newValues).length > 0)
    detailParts.push(`Updated ${Object.keys(newValues).join(', ')}`);
  if (oldValues && Object.keys(oldValues).length > 0)
    detailParts.push('from previous values');

  if (detailParts.length > 0)
    return `${actorStr} performed ${event}. ${detailParts.join(' ')}.`;

  return `${actorStr} performed the action: ${event}.`;
};

const FieldBlock = ({ label, children }) => (
  <div className="flex flex-col gap-[6px]">
    <span className="font-extrabold text-[#64748b] dark:text-slate-500 uppercase text-[0.75rem] tracking-[0.8px]">{label}</span>
    {children}
  </div>
);

const AuditDetailModal = ({ log, onClose }) => {
  if (!log) return null;

  return (
    <div
      className="fixed inset-0 bg-[#00212e]/60 dark:bg-slate-950/80 flex items-center justify-center z-[1000] p-[20px] backdrop-blur-[3px] animate-[fadeIn_0.2s_ease]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[16px] shadow-2xl w-[90%] max-w-[600px] flex flex-col animate-[slideUp_0.3s_ease] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-[24px_32px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[16px]">
          <div>
            <h2 className="text-[1.5rem] text-[#00212e] dark:text-white m-0 font-extrabold">Audit Record</h2>
            <p className="text-[0.9rem] text-[#64748b] dark:text-slate-400 font-medium m-[4px_0_0_0]">
              ID: <span className="font-mono">{log._id}</span>
            </p>
          </div>
          <button
            className="bg-transparent border border-[#cbd5e1] dark:border-slate-600 w-[36px] h-[36px] rounded-full flex items-center justify-center text-[#64748b] dark:text-slate-400 hover:bg-[#f1f5f9] dark:hover:bg-slate-700 hover:text-[#e11d48] dark:hover:text-rose-400 cursor-pointer transition-colors"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[18px] h-[18px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-[32px] flex flex-col gap-[24px] overflow-y-auto max-h-[70vh]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[24px]">
            <FieldBlock label="Timestamp">
              <span className="font-bold text-[#00212e] dark:text-white text-[1rem]">
                {new Date(log.createdAt).toLocaleString()}
              </span>
            </FieldBlock>
            <FieldBlock label="Status">
              <span className={`inline-block px-[10px] py-[4px] rounded-[6px] text-[0.75rem] font-black uppercase tracking-[0.8px] w-fit ${statusClass(log.status)}`}>
                {getStatusText(log.status)}
              </span>
            </FieldBlock>
            <FieldBlock label="Category">
              <span className="font-bold text-[#00a8e8] dark:text-[#38bdf8] text-[1rem]">{log.category}</span>
            </FieldBlock>
            <FieldBlock label="Actor">
              <div className="flex flex-col gap-[2px]">
                <span className="font-bold text-[#00212e] dark:text-white text-[1rem]">
                  {log.actorName || 'Unknown'}
                </span>
                <span className="text-[#64748b] dark:text-slate-400 font-medium text-[0.85rem]">
                  {log.actorRole || 'System'}
                </span>
              </div>
            </FieldBlock>
          </div>

          <div className="h-[1px] bg-[#e2e8f0] dark:bg-slate-700 w-full"></div>

          <FieldBlock label="Event Type">
            <span className="font-bold text-[#00212e] dark:text-white text-[1.1rem]">{log.event}</span>
          </FieldBlock>

          <FieldBlock label="System Purpose">
            <span className="font-medium text-[#475569] dark:text-slate-300 text-[0.95rem] leading-[1.6]">
              {log.purpose || 'Routine operational logging.'}
            </span>
          </FieldBlock>

          <div className="flex flex-col gap-[10px] mt-[8px]">
            <span className="font-extrabold text-[#64748b] dark:text-slate-500 uppercase text-[0.75rem] tracking-[0.8px]">Action Details</span>
            <div className="bg-[#f0f9ff] dark:bg-[#0284c7]/10 border border-[#bae6fd] dark:border-[#0284c7]/30 p-[20px] rounded-[12px]">
              <p className="m-0 text-[#00435c] dark:text-[#38bdf8] text-[1rem] leading-[1.6] font-medium">
                {formatLogDetails(log)}
              </p>
            </div>
          </div>
        </div>

        <div className="p-[20px_32px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[16px] flex justify-end">
          <button
            className="p-[12px_28px] bg-white dark:bg-slate-800 border border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 font-bold text-[0.9rem] rounded-[8px] hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors cursor-pointer"
            onClick={onClose}
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuditDetailModal;