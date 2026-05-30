import React from 'react';
import { BarChart } from '@mui/x-charts/BarChart';
import { Gauge, gaugeClasses } from '@mui/x-charts/Gauge';

const ReportModal = ({ barData, overallPercentage, isDark, isSavingReport, onSaveAndDownload, onClose }) => {
  return (
    <div
      className="fixed inset-0 bg-[#00212e]/80 dark:bg-slate-950/90 flex items-center justify-center z-[1000] animate-[fadeIn_0.2s_ease] backdrop-blur-[4px] p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-[16px] shadow-2xl w-[90%] max-w-[900px] max-h-[90vh] overflow-y-auto animate-[slideUp_0.3s_ease] transition-colors duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center p-[24px_32px] border-b border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-t-[16px]">
          <div>
            <h2 className="m-0 text-[1.6rem] text-[#00212e] dark:text-white font-extrabold flex items-center gap-[10px]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[28px] h-[28px] text-[#00a8e8] dark:text-[#38bdf8]">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              Official Reports Summary
            </h2>
            <p className="text-[#64748b] dark:text-slate-400 text-[0.95rem] font-medium m-0 mt-[6px]">
              Analytics overview for {new Date().toLocaleDateString()}
            </p>
          </div>
          <button
            className="bg-transparent border-none w-[36px] h-[36px] flex items-center justify-center cursor-pointer rounded-[8px] transition-all text-[#64748b] dark:text-slate-400 hover:bg-[#e2e8f0] dark:hover:bg-slate-700 hover:text-[#d32f2f] dark:hover:text-rose-400"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-[20px] h-[20px]">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="p-[32px]">
          <div id="report-charts-container" className="flex flex-col lg:flex-row gap-[24px] mb-[16px] bg-white dark:bg-slate-800 p-[10px] transition-colors duration-300">
            <div className="flex-[2] bg-[#f8fafc] dark:bg-slate-900/50 border border-[#e2e8f0] dark:border-slate-700 rounded-[12px] p-[24px] shadow-sm">
              <h3 className="text-[#64748b] dark:text-slate-400 text-[0.8rem] uppercase tracking-[1.5px] font-bold m-[0_0_16px_0]">Attendance per House</h3>
              <div className="w-full h-[280px]">
                <BarChart
                  colors={isDark ? ['#34d399', '#fb7185'] : ['#10b981', '#e11d48']}
                  series={[
                    { data: barData.present, label: 'Present' },
                    { data: barData.absent, label: 'Absent' },
                  ]}
                  xAxis={[{
                    data: barData.xAxis,
                    scaleType: 'band',
                    tickLabelStyle: { angle: -30, textAnchor: 'end', fontSize: 11 },
                  }]}
                  margin={{ top: 20, bottom: 60, left: 40, right: 10 }}
                  sx={{
                    '& .MuiChartsAxis-tickLabel': { fill: isDark ? '#94a3b8 !important' : '#64748b !important' },
                    '& .MuiChartsAxis-line': { stroke: isDark ? '#475569 !important' : '#cbd5e1 !important' },
                    '& .MuiChartsAxis-tick': { stroke: isDark ? '#475569 !important' : '#cbd5e1 !important' },
                    '& .MuiChartsLegend-mark': { rx: 4, ry: 4 },
                    '& .MuiChartsLegend-label': { fill: isDark ? '#cbd5e1 !important' : '#334155 !important' },
                  }}
                />
              </div>
            </div>

            <div className="flex-[1] bg-[#f8fafc] dark:bg-slate-900/50 border border-[#e2e8f0] dark:border-slate-700 rounded-[12px] p-[24px] shadow-sm flex flex-col items-center">
              <h3 className="text-[#64748b] dark:text-slate-400 text-[0.8rem] uppercase tracking-[1.5px] font-bold m-[0_0_16px_0] w-full text-left">Overall Presence</h3>
              <div className="flex-1 flex items-center justify-center w-full relative pt-[20px]">
                <Gauge
                  width={200}
                  height={200}
                  value={overallPercentage}
                  text={({ value }) => `${value}%`}
                  sx={{
                    [`& .${gaugeClasses.valueArc}`]: { fill: isDark ? '#38bdf8' : '#00a8e8' },
                    [`& .${gaugeClasses.referenceArc}`]: { fill: isDark ? '#334155' : '#e1f5fe' },
                    [`& .${gaugeClasses.valueText}`]: { fill: isDark ? '#fff' : '#00212e', fontSize: '2.5rem', fontWeight: 800 },
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-[12px] p-[20px_32px] border-t border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-900/50 rounded-b-[16px]">
          <button
            className="p-[12px_24px] bg-white dark:bg-slate-800 border-[1.5px] border-[#cbd5e1] dark:border-slate-600 text-[#475569] dark:text-slate-300 rounded-[8px] font-bold hover:bg-[#e2e8f0] dark:hover:bg-slate-700 transition-colors"
            onClick={onClose}
            disabled={isSavingReport}
          >
            Cancel
          </button>
          <button
            className="p-[12px_28px] border-none bg-gradient-to-br from-[#00435c] to-[#00212e] dark:from-[#0284c7] dark:to-[#0369a1] text-white rounded-[8px] font-bold shadow-[0_4px_12px_rgba(0,67,92,0.3)] dark:shadow-[0_4px_12px_rgba(2,132,199,0.3)] hover:-translate-y-[2px] transition-all flex items-center gap-[8px] disabled:opacity-70 disabled:cursor-not-allowed"
            onClick={onSaveAndDownload}
            disabled={isSavingReport}
          >
            {isSavingReport ? 'Archiving...' : 'Save to Archive & Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReportModal;