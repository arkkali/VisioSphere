import { resolveAlertMeta } from "./alertMeta";

const ToastNotification = ({ toast, onDismiss }) => {
  const textForMeta = toast.rawMessage || toast.incidentType || toast.message || '';
  const meta = resolveAlertMeta(textForMeta, toast.type || toast.rawType || '');
  return (
    <div
      className={`w-[320px] bg-white dark:bg-slate-800 border-l-[5px] shadow-2xl rounded-lg overflow-hidden animate-[slideIn_0.3s_ease-out] ${meta.border}`}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2">
            <span
              className={`text-white text-[9px] font-black px-2 py-0.5 rounded tracking-widest ${meta.badge}`}
            >
              {meta.icon} {meta.label.toUpperCase()}
            </span>
          </div>
          <button
            onClick={() => onDismiss(toast.id)}
            className="text-[#9a9eab] dark:text-slate-400 hover:text-[#003543] dark:hover:text-white font-bold text-lg leading-none"
          >
            ✕
          </button>
        </div>
        <h4 className="text-[#003543] dark:text-white font-black text-sm m-0 leading-tight">
          {toast.message}
        </h4>
        <p className={`text-xs mt-1 font-semibold ${meta.text}`}>
          {toast.location}
        </p>
        <p className="text-[#9a9eab] dark:text-slate-400 text-[10px] mt-0.5 font-medium">
          {toast.timestamp}
        </p>
        <div className="mt-3 h-1 w-full bg-[#f5f7f9] dark:bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${meta.bg} animate-[progress_6s_linear]`} />
        </div>
      </div>
    </div>
  );
};

export default ToastNotification;
