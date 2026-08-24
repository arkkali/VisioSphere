// frontend/src/components/videoClips/VideoClipCard.jsx
//
// The duration badge is conditionally rendered. clip.duration has no backend
// source (see videoClipsService.js's mapIncidentToClip) — it is only ever
// populated client-side, in VideoPlayerModal, once a clip has actually been
// played and its real duration read from the video element. A permanent
// "--:--" placeholder would look broken since it would never resolve on a card
// nobody has opened; omitting the badge reads as "duration not yet known".
//
// The overflow menu was a three-item list where two items (Download, Delete)
// were permanently `disabled` placeholders. A menu whose only working entry
// duplicates clicking the card is worse than no menu, so the menu is gone and
// the thumbnail click is the single, obvious affordance. Clip retention is
// handled by ai_core's own rotation on the mini PC, not by staff deletion —
// there is no delete endpoint, and adding one would need an audit trail and a
// facility check before it could be safe to expose.

import React from 'react';

const BADGE_STYLES = {
  Fall:         { bg: 'bg-[#ef4444]', label: 'FALL DETECTED' },
  Agitation:    { bg: 'bg-[#a855f7]', label: 'AGITATION DETECTED' },
  'Lying Down': { bg: 'bg-[#3b82f6]', label: 'LYING DOWN DETECTED' },
  Inactivity:   { bg: 'bg-[#eab308]', label: 'INACTIVITY' },
};

const VideoClipCard = ({ clip, onSelect }) => {
  const badge = BADGE_STYLES[clip.eventType] || {
    bg: 'bg-[#94a3b8]',
    label: clip.eventType?.toUpperCase() || 'EVENT',
  };

  return (
    <div className="relative bg-white dark:bg-[#00212e] rounded-[16px] border border-[#e2e8f0] dark:border-[#00435c] overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* Thumbnail */}
      <button
        onClick={() => onSelect(clip)}
        className="relative w-full aspect-video bg-gradient-to-br from-[#eaf8fe] to-[#d6f0fb] dark:from-[#00344a] dark:to-[#00212e] flex items-center justify-center cursor-pointer border-none p-0 group"
        aria-label={`Play ${badge.label} clip from ${clip.cameraName} at ${clip.timeLabel}`}
      >
        {clip.thumbnail ? (
          <img src={clip.thumbnail} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : null}

        <span className={`absolute top-2 left-2 py-[3px] px-[8px] rounded-[6px] text-white text-[0.62rem] font-bold tracking-wide ${badge.bg}`}>
          {badge.label}
        </span>
        <span className="absolute top-2 right-2 text-[0.68rem] font-semibold text-[#00212e] dark:text-white bg-white/70 dark:bg-[#00212e]/70 px-[6px] py-[1px] rounded-[4px]">
          {clip.timeLabel}
        </span>

        <span className="relative z-10 w-[42px] h-[42px] rounded-full bg-[#00a8e8] flex items-center justify-center shadow-[0_4px_10px_rgba(0,168,232,0.35)] group-hover:scale-110 transition-transform duration-150">
          <svg viewBox="0 0 24 24" fill="white" className="w-[16px] h-[16px] ml-[2px]">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>

        {clip.duration && (
          <span className="absolute bottom-2 right-2 text-[0.65rem] font-bold text-white bg-black/55 px-[6px] py-[1px] rounded-[4px]">
            {clip.duration}
          </span>
        )}
      </button>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 py-[9px] px-[12px]">
        <p className="m-0 text-[0.72rem] font-semibold text-[#5a6265] dark:text-[#a6aeb2]">
          {clip.dateLabel}
        </p>
        <p className="m-0 text-[0.68rem] font-semibold text-[#9dabb1] dark:text-[#668894] truncate">
          {clip.cameraName}
        </p>
      </div>
    </div>
  );
};

export default VideoClipCard;
