import React from 'react';

const AlertHistoryModal = ({
  show,
  onClose,
  historyWeeks,
  historyLoading,
  calendarMonth,
  setCalendarMonth,
  calendarGrid,
  hoveredRow,
  setHoveredRow,
  onOpenWeekDetail,
}) => {
  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-[20px]"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#00212e] rounded-[32px] shadow-2xl w-full max-w-[760px] max-h-[85vh] overflow-hidden flex flex-col border border-[#e2e8f0] dark:border-[#00435c]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 py-6 border-b border-[#e1f5fe] dark:border-[#00435c] flex items-center justify-between">
          <div>
            <h3 className="m-0 text-2xl font-black text-[#00212e] dark:text-white">Alert History</h3>
            <p className="m-0 mt-1 text-sm text-[#5a6265] dark:text-[#a6aeb2] font-semibold">Last 5 weeks</p>
          </div>
          <button
            onClick={onClose}
            className="bg-[#f3fbfe] dark:bg-[#00435c] hover:bg-[#e1f5fe] dark:hover:bg-[#0075a2] p-2 rounded-full border-none cursor-pointer text-[#0075a2] dark:text-[#ccedfa] transition-colors"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-6">
          <div className="bg-[#f9fdfe] dark:bg-[#00435c]/50 border border-[#e1f5fe] dark:border-[#00435c] rounded-[24px] p-5">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => {
                  const d = new Date(calendarMonth);
                  d.setMonth(d.getMonth() - 1);
                  setCalendarMonth(d);
                  setHoveredRow(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-[#e1f5fe] dark:hover:bg-[#0075a2] flex items-center justify-center cursor-pointer text-[#0075a2] dark:text-[#b1e9f3] border-none bg-transparent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <span className="font-black text-[#00212e] dark:text-white text-base tracking-wide">
                {calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
              </span>
              <button
                onClick={() => {
                  const d = new Date(calendarMonth);
                  d.setMonth(d.getMonth() + 1);
                  setCalendarMonth(d);
                  setHoveredRow(null);
                }}
                className="w-8 h-8 rounded-full hover:bg-[#e1f5fe] dark:hover:bg-[#0075a2] flex items-center justify-center cursor-pointer text-[#0075a2] dark:text-[#b1e9f3] border-none bg-transparent"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div key={d} className="text-center text-[0.8rem] font-extrabold text-[#5a6265] dark:text-[#a6aeb2] py-1 uppercase">{d}</div>
              ))}
            </div>

            {calendarGrid.map((week, ri) => (
              <div
                key={ri}
                onMouseEnter={() => setHoveredRow(ri)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onOpenWeekDetail(week[0])}
                className={`grid grid-cols-7 gap-1 cursor-pointer rounded-xl transition-colors py-1 ${
                  hoveredRow === ri
                    ? 'bg-[#ccedfa] dark:bg-[#0075a2]/50 ring-2 ring-[#00a8e8]'
                    : 'hover:bg-[#eaf8fe] dark:hover:bg-[#00435c]'
                }`}
              >
                {week.map((date) => {
                  const isOtherMonth = date.getMonth() !== calendarMonth.getMonth();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const isToday = date.getTime() === today.getTime();
                  return (
                    <div
                      key={date.toISOString()}
                      className={`text-center py-2.5 text-[0.95rem] font-bold ${
                        isOtherMonth ? 'text-[#c3d1d8] dark:text-[#2d3132]' : 'text-[#00212e] dark:text-[#ccedfa]'
                      } ${isToday ? 'font-black text-[#00a8e8] bg-[#e1f5fe] dark:bg-[#0075a2] rounded-lg mx-1' : ''}`}
                    >
                      {date.getDate()}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {historyLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-10 h-10 border-4 border-[#00a8e8] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            historyWeeks.map((wk) => (
              <button
                key={wk.startISO}
                onClick={() => onOpenWeekDetail(new Date(wk.startISO + "T12:00:00"))}
                className="bg-[#f9fdfe] dark:bg-[#00435c]/30 border-2 border-[#e1f5fe] dark:border-[#00435c] rounded-[24px] p-6 text-left cursor-pointer transition-all block w-full hover:border-[#00a8e8] dark:hover:border-[#4cc2ee] hover:-translate-y-1 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="m-0 font-black text-lg text-[#00212e] dark:text-white">{wk.label}</p>
                    <p className="m-0 mt-1.5 text-sm text-[#5a6265] dark:text-[#a6aeb2] font-semibold">{wk.total} total alerts recorded</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#eaf8fe] dark:bg-[#0075a2] flex items-center justify-center text-[#00a8e8] dark:text-[#e1f5fe]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertHistoryModal;