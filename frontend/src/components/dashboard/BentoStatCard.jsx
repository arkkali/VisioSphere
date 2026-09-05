// CONTRAST TOKENS — every value below is measured, not eyeballed.
//
// Lighthouse failed this page on "Background and foreground colors do not have
// a sufficient contrast ratio". Eight of the ten flagged nodes were this one
// component, repeated across the four stat cards:
//
//   card title   #94a3b8 on #ffffff = 2.56:1  ->  #64748b = 4.76:1
//   neutral badge #64748b on #f1f5f9 = 4.34:1 ->  #475569 = 6.92:1
//
// Both are small bold text (10-12px), so WCAG AA asks for 4.5:1, not the 3:1
// that applies to large text. 4.34 missing by 0.16 is still a fail.
//
// The dark variants were failing too, just below the audit's reach because the
// run was in light mode:
//   card title   #668894 on #00212e = 4.39:1  ->  #8fb0bc = 7.24:1
//   neutral badge #94a3b8 on #00435c = 4.18:1 ->  #a8b6c6 = 5.20:1
//
// The up/down badges already passed (4.57 and 5.72) and are left alone.
//
// #668894 turned out to be a SHARED dark-mode muted token, used in ~24 places
// across the dashboard, charts and Video Clips — it failed on every dark
// surface it sits on (#00212e 4.39, #00344a 3.47, #00435c 2.82), so it was
// replaced app-wide rather than patched here. #8fb0bc is the value that clears
// 4.5:1 on all three (7.24 / 5.73 / 4.65).

import React from 'react';

const ArrowUp = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ArrowDown = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const Dash = () => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const StatBadge = ({ statData, compact }) => {
  if (!statData) return null;

  const { direction, label, online, total } = statData;

  if (direction === 'none') {
    return (
      <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold tracking-wide whitespace-nowrap bg-[#f1f5f9] text-[#475569] dark:bg-[#00435c] dark:text-[#a8b6c6] ${
        compact ? 'text-[0.6rem]' : 'text-[0.72rem]'
      }`}>
        <span>{online} / {total} online</span>
      </div>
    );
  }

  const isUp      = direction === 'up';
  const isDown    = direction === 'down';
  const isNeutral = direction === 'neutral';

  return (
    <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold tracking-wide whitespace-nowrap ${
      compact ? 'text-[0.6rem]' : 'text-[0.72rem]'
    } ${
      isUp
        ? 'bg-[#dcfce7] text-[#15803d] dark:bg-[#15803d]/20 dark:text-[#4ade80]'
        : isDown
          ? 'bg-[#fff1f2] text-[#be123c] dark:bg-[#be123c]/20 dark:text-[#fb7185]'
          : 'bg-[#f1f5f9] text-[#475569] dark:bg-[#00435c] dark:text-[#a8b6c6]'
    }`}>
      {isUp      && <ArrowUp />}
      {isDown    && <ArrowDown />}
      {isNeutral && <Dash />}
      <span>{label}</span>
    </div>
  );
};

const BentoStatCard = ({ title, value, icon, statData, isDark, primaryColor, bgColor, compact = false }) => {
  if (compact) {
    return (
      <div className={`rounded-[16px] px-4 py-3.5 flex flex-col justify-between border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-[2px] h-full ${
        isDark ? 'bg-[#00212e] border-[#00435c]' : 'bg-white border-[#e2e8f0]'
      }`}>
        <div className="flex items-start justify-between mb-2.5">
          <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 ${bgColor} ${primaryColor}`}>
            {icon}
          </div>
          <StatBadge statData={statData} compact={compact} />
        </div>
        <div>
          <p className={`font-bold text-[0.65rem] uppercase tracking-widest m-0 mb-1 leading-none ${
            isDark ? 'text-[#8fb0bc]' : 'text-[#64748b]'
          }`}>
            {title}
          </p>
          <h2 className={`text-[1.75rem] font-black m-0 leading-none tracking-tight ${
            isDark ? 'text-white' : 'text-[#00212e]'
          }`}>
            {value}
          </h2>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-[20px] p-[24px] flex flex-col justify-between border shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-[2px] h-full ${
      isDark ? 'bg-[#00212e] border-[#00435c]' : 'bg-white border-[#e2e8f0]'
    }`}>
      <div className="flex justify-between items-start mb-4">
        <div className={`w-[48px] h-[48px] rounded-[14px] flex items-center justify-center ${bgColor} ${primaryColor}`}>
          {icon}
        </div>
        <StatBadge statData={statData} compact={compact} />
      </div>
      <div>
        <p className={`font-bold text-[0.75rem] uppercase tracking-widest m-0 mb-1.5 ${
          isDark ? 'text-[#8fb0bc]' : 'text-[#64748b]'
        }`}>
          {title}
        </p>
        <h2 className={`text-[2.2rem] font-black m-0 leading-none tracking-tight ${
          isDark ? 'text-white' : 'text-[#00212e]'
        }`}>
          {value}
        </h2>
      </div>
    </div>
  );
};

export default BentoStatCard;