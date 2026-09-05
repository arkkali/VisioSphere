import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

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
    <div className="bg-white dark:bg-[#00212e] p-3 rounded-[12px] shadow-lg border border-[#e2e8f0] dark:border-[#00435c] min-w-[150px]">
      <p className="font-extrabold text-[#00212e] dark:text-white m-0 mb-1.5 text-[13px] tracking-tight">{label}</p>
      <p className="text-[#00a8e8] dark:text-[#4cc2ee] font-bold m-0 text-[12px] mb-2">
        {`Total: ${total} alert${total !== 1 ? 's' : ''}`}
      </p>
      <div className="flex flex-col gap-1">
        {payload
          .filter((p) => Number(p.value) > 0)
          .map((p) => (
            <div key={p.dataKey} className="flex items-center gap-1.5 text-[11px] text-[#475569] dark:text-[#c3d1d8]">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || p.fill }} />
              <span className="font-semibold">{p.dataKey}:</span>
              <span className="font-bold text-[#00212e] dark:text-white ml-auto pl-2">{p.value}</span>
            </div>
          ))}
      </div>
    </div>
  );
};

const AlertsChartWidget = ({ data, onOpenHistory, isDark }) => {
  const weeklyTotal = data.reduce((acc, day) => acc + (day.alerts || 0), 0);
  const peakDay = data.reduce((best, day) => (day.alerts > best.alerts ? day : best), { alerts: 0, name: '—' });

  return (
    <div className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-sm border border-[#e2e8f0] dark:border-[#00435c] flex flex-col h-full overflow-hidden">

      <div className="px-5 pt-4 pb-3 border-b border-[#f1f5f9] dark:border-[#00435c] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-[5px] h-[18px] bg-[#00a8e8] rounded-full shrink-0"></div>
            <div>
              <h3 className="m-0 text-[#00212e] dark:text-white text-[0.95rem] font-black tracking-tight leading-none">
                7-Day Alert History
              </h3>
              <p className="m-0 mt-0.5 text-[0.7rem] text-[#5a6265] dark:text-[#8fb0bc] font-semibold leading-none">
                Current week · Sun – Sat
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-3 mr-1">
              <div className="text-right">
                <p className="m-0 text-[1.4rem] font-black text-[#00212e] dark:text-white leading-none">{weeklyTotal}</p>
                <p className="m-0 text-[0.65rem] font-bold text-[#5a6265] dark:text-[#8fb0bc] uppercase tracking-wider leading-none mt-0.5">This Week</p>
              </div>
              {peakDay.alerts > 0 && (
                <div className="text-right border-l border-[#e2e8f0] dark:border-[#00435c] pl-3">
                  <p className="m-0 text-[1.4rem] font-black text-[#00a8e8] leading-none">{peakDay.name}</p>
                  <p className="m-0 text-[0.65rem] font-bold text-[#5a6265] dark:text-[#8fb0bc] uppercase tracking-wider leading-none mt-0.5">Peak Day</p>
                </div>
              )}
            </div>

            <button
              onClick={onOpenHistory}
              className="flex items-center gap-1.5 bg-[#f1f9fe] dark:bg-[#00435c] hover:bg-[#dff2fc] dark:hover:bg-[#0075a2] text-[#0075a2] dark:text-[#ccedfa] px-3 py-2 rounded-[10px] font-bold text-[0.7rem] uppercase tracking-wider border border-[#d6eefa] dark:border-[#0075a2] cursor-pointer transition-all hover:scale-105 active:scale-95 shrink-0"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              History
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {CATEGORY_ORDER.map((cat) => (
            <div
              key={cat}
              className="flex items-center gap-1 px-2 py-1 rounded-full bg-[#f8fafc] dark:bg-[#00435c]/60 border border-[#e2e8f0] dark:border-[#00435c]"
            >
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: CATEGORY_COLORS[cat] }}
              />
              <span className="text-[0.65rem] font-bold text-[#475569] dark:text-[#a6aeb2] leading-none whitespace-nowrap">
                {cat}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 px-3 pt-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
            barCategoryGap="28%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={isDark ? '#00435c' : '#f1f5f9'}
            />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? '#8fb0bc' : '#64748b', fontSize: 11, fontWeight: 700 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: isDark ? '#8fb0bc' : '#64748b', fontSize: 11, fontWeight: 700 }}
              allowDecimals={false}
              domain={[0, (dataMax) => Math.max(3, Math.ceil(dataMax * 1.2))]}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: isDark ? 'rgba(76, 194, 238, 0.05)' : 'rgba(0, 168, 232, 0.06)', radius: 6 }}
            />
            {CATEGORY_ORDER.map((cat, idx) => (
              <Bar
                key={cat}
                dataKey={cat}
                stackId="alerts"
                fill={CATEGORY_COLORS[cat]}
                maxBarSize={48}
                radius={idx === CATEGORY_ORDER.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AlertsChartWidget;