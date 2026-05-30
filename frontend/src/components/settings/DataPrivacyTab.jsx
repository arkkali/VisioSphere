import { useState, useEffect, useCallback } from 'react';
import { fetchArchiveStatus, triggerAuditArchive } from '../../services/settingsService';

const DataPrivacyTab = ({ onMessage }) => {
  const [archiveStatus, setArchiveStatus] = useState(null);
  const [isTriggering, setIsTriggering] = useState(false);

  const loadArchiveStatus = useCallback(async () => {
    try {
      const data = await fetchArchiveStatus();
      setArchiveStatus(data);
    } catch {
      onMessage('Failed to load archive status.', 'error');
    }
  }, [onMessage]);

  useEffect(() => {
    loadArchiveStatus();
  }, [loadArchiveStatus]);

  const handleTriggerArchive = async () => {
    setIsTriggering(true);
    try {
      const result = await triggerAuditArchive();
      if (result.skipped) {
        onMessage('No logs older than 30 days found. Archive skipped.', 'success');
      } else {
        onMessage(`Archive complete — ${result.archived} logs exported to ${result.filename}.`, 'success');
      }
      await loadArchiveStatus();
    } catch {
      onMessage('Archive failed. Please try again or contact support.', 'error');
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="animate-[fadeIn_0.3s_ease] flex flex-col gap-[24px]">
      <div className="bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] dark:from-slate-800 dark:to-slate-900 border-[2px] border-[#cbd5e1] dark:border-slate-700 rounded-[16px] overflow-hidden shadow-sm transition-colors duration-300">
        <div className="p-[24px] border-b border-[#cbd5e1] dark:border-slate-700 flex items-center gap-[12px]">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" className="text-[#00212e] dark:text-white" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
          <h3 className="m-0 text-[1.3rem] text-[#00212e] dark:text-white font-black tracking-[-0.5px]">Global Data Compliance</h3>
        </div>

        <div className="p-[32px] flex flex-col gap-[32px]">
          <div className="bg-[#fffbeb] dark:bg-amber-950/30 border border-[#fcd34d] dark:border-amber-700/50 p-[16px] rounded-[8px] transition-colors duration-300">
            <p className="m-0 text-[#b45309] dark:text-amber-500 font-bold text-[0.95rem] flex items-center gap-[8px]">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              System policies are strictly locked by the Principal Administrator to ensure legal compliance.
            </p>
          </div>

          <div className="flex flex-col gap-[8px]">
            <h4 className="m-0 text-[1.1rem] text-[#00212e] dark:text-white font-extrabold">CCTV Video Retention Policy</h4>
            <p className="text-[#64748b] dark:text-slate-400 m-0 text-[0.95rem]">Automatic permanent deletion cycle for recorded facility footage.</p>
            <div className="mt-[8px] flex items-center gap-[12px]">
              <input type="text" value="30 Days" disabled className="p-[12px_16px] bg-[#e2e8f0] dark:bg-slate-800 border-[2px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 font-black text-[1rem] rounded-[8px] w-[120px] text-center cursor-not-allowed opacity-80" />
              <span className="text-[0.85rem] font-bold text-[#94a3b8] dark:text-slate-400 uppercase tracking-[1px] bg-[#f1f5f9] dark:bg-slate-700 p-[6px_12px] rounded-[6px]">System Locked</span>
            </div>
          </div>

          <div className="h-[1px] bg-[#cbd5e1] dark:bg-slate-700 w-full"></div>

          <div className="flex flex-col gap-[12px]">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-[12px]">
              <div className="flex flex-col gap-[8px]">
                <h4 className="m-0 text-[1.1rem] text-[#00212e] dark:text-white font-extrabold">Audit Trail Auto-Archive</h4>
                <p className="text-[#64748b] dark:text-slate-400 m-0 text-[0.95rem]">Every 30 days, logs are exported to a structured Excel file and purged from the database.</p>
                <div className="mt-[4px] flex items-center gap-[12px]">
                  <input type="text" value="30 Days" disabled className="p-[12px_16px] bg-[#e2e8f0] dark:bg-slate-800 border-[2px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 font-black text-[1rem] rounded-[8px] w-[120px] text-center cursor-not-allowed opacity-80" />
                  <span className="text-[0.85rem] font-bold text-[#94a3b8] dark:text-slate-400 uppercase tracking-[1px] bg-[#f1f5f9] dark:bg-slate-700 p-[6px_12px] rounded-[6px]">System Locked</span>
                </div>
              </div>

              <button
                onClick={handleTriggerArchive}
                disabled={isTriggering}
                className="self-start md:self-auto p-[12px_20px] bg-[#00212e] dark:bg-[#00a8e8] text-white border-none rounded-[8px] font-bold text-[0.9rem] cursor-pointer hover:bg-[#00435c] dark:hover:bg-[#0088b8] transition-colors disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isTriggering ? 'Archiving...' : 'Run Archive Now'}
              </button>
            </div>

            {archiveStatus && (
              <div className="bg-white dark:bg-slate-800 border border-[#e2e8f0] dark:border-slate-700 rounded-[12px] p-[16px] flex flex-col gap-[8px]">
                <div className="flex items-center gap-[8px]">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#10b981]"><polyline points="20 6 9 17 4 12"></polyline></svg>
                  <span className="text-[0.85rem] font-bold text-[#475569] dark:text-slate-300 uppercase tracking-[0.5px]">Archive History</span>
                </div>
                <div className="flex flex-wrap gap-[16px] text-[0.9rem]">
                  <span className="text-[#64748b] dark:text-slate-400">
                    Last archive: <strong className="text-[#00212e] dark:text-white">{archiveStatus.lastArchive ?? 'Never'}</strong>
                  </span>
                  <span className="text-[#64748b] dark:text-slate-400">
                    Total archives: <strong className="text-[#00212e] dark:text-white">{archiveStatus.archiveCount}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataPrivacyTab;