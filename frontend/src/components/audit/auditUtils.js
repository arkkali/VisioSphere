export const STATUS_CLASSES = {
  success: 'bg-[#f0fdf4] dark:bg-emerald-950/30 text-[#10b981] dark:text-emerald-400',
  alert: 'bg-[#fffbeb] dark:bg-amber-950/30 text-[#d97706] dark:text-amber-500',
  failed: 'bg-[#fff1f2] dark:bg-rose-950/30 text-[#e11d48] dark:text-rose-400',
};

export const getStatusText = (status) => {
  if (!status) return 'Unknown';
  const s = status.toLowerCase();
  if (s === 'success') return 'Success';
  if (s === 'alert') return 'Alert';
  if (s === 'failed') return 'Failed';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

export const statusClass = (status) =>
  STATUS_CLASSES[status?.toLowerCase()] || 'bg-[#f8fafc] dark:bg-slate-800 text-[#64748b] dark:text-slate-400';