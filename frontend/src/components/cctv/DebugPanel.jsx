import { resolveAlertMeta } from './alertMeta';

const DebugPanel = ({ events }) => (
  <div className="fixed bottom-4 left-4 z-[9998] w-[300px] bg-[#003543]/95 dark:bg-slate-900/95 rounded-xl border border-[#00a8e8]/30 dark:border-slate-700 shadow-2xl overflow-hidden">
    <div className="px-3 py-2 border-b border-[#00a8e8]/20 dark:border-slate-800 flex justify-between items-center">
      <span className="text-[10px] font-black text-[#00a8e8] dark:text-[#38bdf8] uppercase tracking-widest">🔬 Live Detection Events</span>
      <span className="text-[9px] text-[#9a9eab] dark:text-slate-400 font-medium">last 5</span>
    </div>
    <div className="flex flex-col divide-y divide-[#ffffff]/5 dark:divide-slate-800 max-h-[200px] overflow-y-auto">
      {events.length === 0 ? (
        <p className="text-[10px] text-[#9a9eab] dark:text-slate-400 font-medium p-3">Waiting for events from AI core…</p>
      ) : (
        events.map((e, i) => {
          const meta = resolveAlertMeta(e.message, e.type);
          return (
            <div key={i} className="px-3 py-2 flex items-start gap-2">
              <span className="text-base leading-none">{meta.icon}</span>
              <div className="min-w-0">
                <p className={`text-[10px] font-black uppercase tracking-wide ${meta.text} truncate`}>{meta.label}</p>
                <p className="text-[10px] text-[#9a9eab] dark:text-slate-300 truncate">{e.message}</p>
                <p className="text-[9px] text-[#9a9eab]/60 dark:text-slate-500 font-medium">{e.location} · {e.timestamp}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
);

export default DebugPanel;