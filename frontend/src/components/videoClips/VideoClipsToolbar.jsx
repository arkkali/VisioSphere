// frontend/src/components/videoClips/VideoClipsToolbar.jsx
import React from 'react';

// SCOPE NOTE: "All Cameras" and "Filters" were visual-only placeholders in the
// original handoff. They have been removed rather than shipped inert — a
// button that looks clickable and does nothing reads as a broken feature, and
// the controls they duplicated already exist: camera selection is the
// HouseSelector row directly below, and event filtering is the pill row above.
// Date range remains a static label; the backend window is fixed at 7 days
// (see useVideoClips.js) and no date-picker library is installed.
const VideoClipsToolbar = ({ search, onSearchChange, dateRangeLabel }) => {
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
