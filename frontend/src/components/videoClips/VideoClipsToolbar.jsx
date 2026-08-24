// frontend/src/components/videoClips/VideoClipsToolbar.jsx
//
// Search, sort, and the date-range label. The original handoff also had
// "All Cameras" and "Filters" buttons that did nothing; they were removed
// rather than shipped inert, and the controls they duplicated already exist —
// camera selection is the HouseSelector row below, event filtering is the pill
// row above. Date range is a static label: the backend window is fixed at 7
// days (see useVideoClips.js) and no date-picker library is installed.
import React from 'react';

const VideoClipsToolbar = ({
  search,
  onSearchChange,
  dateRangeLabel,
  sortBy,
  onSortChange,
  sortOptions,
}) => {
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <div className="relative flex-1 min-w-[220px]">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9dabb1] dark:text-[#668894]"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search by event, location or camera..."
          className="w-full py-[10px] pl-9 pr-3 rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.82rem] font-medium text-[#00212e] dark:text-white placeholder:text-[#9dabb1] dark:placeholder:text-[#668894] outline-none focus:border-[#00a8e8] transition-colors"
        />
      </div>

      {/* A native <select>: it is keyboard accessible, works on touch, and
          needs no outside-click handling — none of which a hand-rolled
          dropdown would get for free. */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5a6265] dark:text-[#a6aeb2] pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="7" y1="12" x2="17" y2="12" />
          <line x1="10" y1="18" x2="14" y2="18" />
        </svg>
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
          aria-label="Sort clips"
          className="appearance-none py-[10px] pl-9 pr-8 rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.78rem] font-bold text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] hover:border-[#00a8e8]/50 transition-colors cursor-pointer"
        >
          {sortOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
        <svg
          className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9dabb1] dark:text-[#668894] pointer-events-none"
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      <div className="flex items-center gap-2 py-[10px] px-[14px] rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-[#f9fdfe] dark:bg-[#00212e] text-[0.78rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] whitespace-nowrap">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
        {dateRangeLabel}
      </div>
    </div>
  );
};

export default VideoClipsToolbar;
