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
      <div className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold tracking-wide whitespace-nowrap bg-[#f1f5f9] text-[#64748b] dark:bg-[#00435c] dark:text-[#94a3b8] ${
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
          : 'bg-[#f1f5f9] text-[#64748b] dark:bg-[#00435c] dark:text-[#94a3b8]'
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
            isDark ? 'text-[#668894]' : 'text-[#94a3b8]'
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
          isDark ? 'text-[#668894]' : 'text-[#94a3b8]'
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