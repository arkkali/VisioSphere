import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const CATEGORY_ORDER = ["Fall", "Agitation", "Inactivity", "Lying Down"];

const CATEGORY_COLORS = {
  Fall: "#ef4444",
  Agitation: "#a855f7",
  Inactivity: "#eab308",
  "Lying Down": "#64748b",
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
  return (
    <div className="bg-white dark:bg-slate-800 p-[12px] rounded-[12px] shadow-lg border border-[#e2e8f0] dark:border-[#2d3132] min-w-[160px]">
      <p className="font-extrabold text-[#0f172a] dark:text-white m-0 mb-[6px] tracking-tight">{label}</p>
      <p className="text-[#00a8e8] dark:text-[#4cc2ee] font-bold m-0 text-[14px] mb-[8px]">{`Alerts Recorded: ${total}`}</p>
      <div className="flex flex-col gap-[4px]">
        {payload.filter((p) => Number(p.value) > 0).map((p) => (
          <div key={p.dataKey} className="flex items-center gap-[8px] text-[12px] text-[#475569] dark:text-[#c3d1d8]">
            <span className="inline-block w-[8px] h-[8px] rounded-full" style={{ backgroundColor: p.color || p.fill }} />
            <span className="font-semibold">{p.dataKey}:</span>
            <span className="font-bold text-[#0f172a] dark:text-white">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const WeekDetailModal = ({ selectedWeek, selectedWeekData, selectedWeekLoading, onClose, isDark }) => {
  if (!selectedWeek) return null;

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-md flex items-center justify-center p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#00212e] rounded-[32px] shadow-2xl w-full max-w-[650px] max-h-[85vh] overflow-hidden flex flex-col border border-[#e2e8f0] dark:border-[#00435c]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-[#e1f5fe] dark:border-[#00435c] flex items-center justify-between">
          <div>
            <p className="m-0 text-xs font-black uppercase tracking-widest text-[#00a8e8]">Week Detail</p>
            <h3 className="m-0 mt-1 text-2xl font-black text-[#00212e] dark:text-white tracking-tight">{selectedWeek.label}</h3>
          </div>
          <button
            onClick={onClose}
            className="bg-[#f3fbfe] dark:bg-[#00435c] hover:bg-[#e1f5fe] dark:hover:bg-[#0075a2] p-2.5 rounded-full border-none cursor-pointer text-[#0075a2] dark:text-[#ccedfa] transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 p-8">
          {selectedWeekLoading || !selectedWeekData ? (
            <div className="flex justify-center py-12">
              <div className="w-10 h-10 border-4 border-[#00a8e8] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-[32px] bg-[#f9fdfe] dark:bg-[#00435c]/30 p-6 rounded-[24px] border border-[#eaf8fe] dark:border-[#00435c]">
                <div>
                  <p className="text-[3.5rem] font-black text-[#00212e] dark:text-white m-0 leading-none">{selectedWeekData.total}</p>
                  <p className="text-sm text-[#5a6265] dark:text-[#a6aeb2] font-bold m-0 mt-2 uppercase tracking-wider">Total Alerts</p>
                </div>
                <span className={`text-[0.85rem] font-black uppercase tracking-widest px-5 py-2.5 rounded-full ${
                  selectedWeekData.total === 0
                    ? 'bg-[#eaf8fe] text-[#0075a2]'
                    : selectedWeekData.total < 10
                      ? 'bg-[#fef9c3] text-[#a16207]'
                      : 'bg-[#fff1f2] text-[#e11d48]'
                }`}>
                  {selectedWeekData.total === 0 ? 'Quiet Week' : selectedWeekData.total < 10 ? 'Normal Volume' : 'High Activity'}
                </span>
              </div>

              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={selectedWeekData.days} margin={{ top: 16, right: 16, left: -20, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#00435c' : '#f3fbfe'} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: isDark ? '#668894' : '#649ca7', fontSize: 13, fontWeight: 700 }}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: isDark ? '#668894' : '#649ca7', fontSize: 13, fontWeight: 700 }}
                      allowDecimals={false}
                      domain={[0, (dataMax) => Math.max(3, Math.ceil(dataMax * 1.2))]}
                    />
                    <RechartsTooltip
                      cursor={{ fill: isDark ? 'rgba(76, 194, 238, 0.05)' : 'rgba(0, 168, 232, 0.08)' }}
                      content={<CustomTooltip />}
                    />
                    {CATEGORY_ORDER.map((cat, idx) => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="alerts"
                        fill={CATEGORY_COLORS[cat]}
                        maxBarSize={56}
                        radius={idx === CATEGORY_ORDER.length - 1 ? [8, 8, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeekDetailModal;