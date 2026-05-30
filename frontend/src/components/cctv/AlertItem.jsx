import { resolveAlertMeta } from './alertMeta';

const AlertItem = ({ alert, onResolveIntent, onDismiss }) => {
  const meta = resolveAlertMeta(alert.message, alert.rawType);

  const resolvedBorder = 'border-l-emerald-500';
  const resolvedBadge  = 'bg-emerald-500';
  const resolvedText   = 'text-emerald-600 dark:text-emerald-400';

  const borderClass = alert.isResolved ? resolvedBorder : meta.border;
  const badgeClass  = alert.isResolved ? resolvedBadge  : meta.badge;
  const textClass   = alert.isResolved ? resolvedText   : meta.text;

  return (
    <div className={`relative flex flex-col bg-white dark:bg-slate-800 rounded-lg border border-[#e2e8f0] dark:border-slate-700 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden border-l-[4px] shrink-0 ${borderClass}`}>
      <button
        onClick={() => onDismiss(alert._id)}
        title="Remove from view"
        aria-label="Dismiss alert"
        className="absolute top-2 right-2 w-6 h-6 rounded-full text-[#9a9eab] dark:text-slate-400 hover:text-[#ff4757] dark:hover:text-rose-400 hover:bg-[#fff0f0] dark:hover:bg-rose-950/30 flex items-center justify-center transition-colors z-10"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="p-3 pr-9">
        <div className="flex justify-between items-center mb-1.5">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${badgeClass}`} />
            <span className={`text-[11px] font-black uppercase tracking-wider ${textClass}`}>
              {meta.icon} {alert.isResolved ? 'Resolved' : meta.label}
            </span>
          </div>
          <span className="text-[9px] text-[#9a9eab] dark:text-slate-400 font-bold uppercase tracking-wider mr-6">
            {alert.timestamp}
          </span>
        </div>

        <p className="text-sm font-bold text-[#003543] dark:text-white mb-0.5 leading-snug">{alert.message}</p>
        <p className="text-[11px] text-[#9a9eab] dark:text-slate-400 mb-3 font-medium">{alert.camera}</p>

        <div className="flex justify-between items-center">
          {alert.isResolved ? (
            <span className="text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider bg-[#e6f9f0] dark:bg-emerald-900/30 text-[#2ed573] dark:text-emerald-400">
              ✓ Resolved by {alert.resolverName || 'Staff'}
            </span>
          ) : (
            <>
              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${alert.status === 'Resolved' ? 'bg-[#e6f9f0] dark:bg-emerald-900/30 text-[#2ed573] dark:text-emerald-400' : 'bg-[#fff0f0] dark:bg-rose-900/30 text-[#ff4757] dark:text-rose-400'}`}>
                {alert.status}
              </span>
              <button
                onClick={() => onResolveIntent(alert)}
                className="text-[10px] font-bold text-[#00a8e8] dark:text-[#38bdf8] hover:text-[#003543] dark:hover:text-white transition-colors uppercase tracking-wide"
              >
                Acknowledge
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertItem;