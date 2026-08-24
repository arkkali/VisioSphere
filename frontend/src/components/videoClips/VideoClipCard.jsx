// frontend/src/components/videoClips/VideoClipCard.jsx
//
// The duration badge is conditional. clip.duration has no backend source (see
// videoClipsService.js's mapIncidentToClip) — it is only ever populated
// client-side, in VideoPlayerModal, once a clip has been played and its real
// duration read from the video element. A permanent "--:--" placeholder would
// look broken since it would never resolve on a card nobody has opened;
// omitting the badge reads as "duration not yet known".
//
// The thumbnail is a signed poster URL fetched in batch by useVideoClips. It
// can legitimately be absent (clips recorded before ai_core wrote posters) or
// expire while the page sits open, so an image failure silently reverts to the
// gradient rather than showing a broken-image icon.

import React, { useState, useRef, useEffect } from 'react';

const BADGE_STYLES = {
  Fall:         { bg: 'bg-[#ef4444]', label: 'FALL DETECTED' },
  Agitation:    { bg: 'bg-[#a855f7]', label: 'AGITATION DETECTED' },
  'Lying Down': { bg: 'bg-[#3b82f6]', label: 'LYING DOWN DETECTED' },
  Inactivity:   { bg: 'bg-[#eab308]', label: 'INACTIVITY' },
};

const VideoClipCard = ({ clip, onSelect, onEdit, onDelete, canDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    if (menuOpen) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  const badge = BADGE_STYLES[clip.eventType] || {
    bg: 'bg-[#94a3b8]',
    label: clip.eventType?.toUpperCase() || 'EVENT',
  };

  const showThumb = clip.thumbnail && !thumbFailed;

  return (
    <div className="relative bg-white dark:bg-[#00212e] rounded-[16px] border border-[#e2e8f0] dark:border-[#00435c] overflow-hidden hover:shadow-md transition-shadow duration-200">
      {/* Thumbnail */}
      <button
        onClick={() => onSelect(clip)}
        className="relative w-full aspect-video bg-gradient-to-br from-[#eaf8fe] to-[#d6f0fb] dark:from-[#00344a] dark:to-[#00212e] flex items-center justify-center cursor-pointer border-none p-0 group"
        aria-label={`Play ${badge.label} clip from ${clip.cameraName} at ${clip.timeLabel}`}
      >
        {showThumb && (
          <img
            src={clip.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Scrim only when there is an image behind it — the badges need
            contrast over real footage, but would look muddy over the gradient. */}
        {showThumb && (
          <span className="absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/25" />
        )}

        <span className={`absolute top-2 left-2 z-10 py-[3px] px-[8px] rounded-[6px] text-white text-[0.62rem] font-bold tracking-wide ${badge.bg}`}>
          {badge.label}
        </span>
        <span className="absolute top-2 right-2 z-10 text-[0.68rem] font-semibold text-[#00212e] dark:text-white bg-white/75 dark:bg-[#00212e]/75 px-[6px] py-[1px] rounded-[4px]">
          {clip.timeLabel}
        </span>

        <span className="relative z-10 w-[42px] h-[42px] rounded-full bg-[#00a8e8] flex items-center justify-center shadow-[0_4px_10px_rgba(0,168,232,0.35)] group-hover:scale-110 transition-transform duration-150">
          <svg viewBox="0 0 24 24" fill="white" className="w-[16px] h-[16px] ml-[2px]">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>

        {clip.duration && (
          <span className="absolute bottom-2 right-2 z-10 text-[0.65rem] font-bold text-white bg-black/55 px-[6px] py-[1px] rounded-[4px]">
            {clip.duration}
          </span>
        )}
      </button>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 py-[9px] px-[12px]">
        <div className="min-w-0">
          <p className="m-0 text-[0.72rem] font-semibold text-[#5a6265] dark:text-[#a6aeb2]">
            {clip.dateLabel}
          </p>
          {clip.note ? (
            <p
              className="m-0 mt-0.5 text-[0.68rem] font-medium text-[#00a8e8] truncate"
              title={clip.note}
            >
              {clip.note}
            </p>
          ) : (
            <p className="m-0 mt-0.5 text-[0.68rem] font-semibold text-[#9dabb1] dark:text-[#668894] truncate">
              {clip.cameraName}
            </p>
          )}
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Clip actions"
            className="w-[22px] h-[22px] flex items-center justify-center rounded-md text-[#9dabb1] dark:text-[#668894] hover:bg-[#f1f5f9] dark:hover:bg-[#00435c] transition-colors"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 bottom-[26px] z-30 bg-white dark:bg-[#00435c] rounded-[10px] shadow-lg border border-[#eaf8fe] dark:border-[#00212e] py-1.5 w-[168px]">
              <button
                onClick={() => { onSelect(clip); setMenuOpen(false); }}
                className="w-full text-left px-3 py-[7px] text-[0.75rem] font-semibold text-[#00212e] dark:text-white hover:bg-[#f9fdfe] dark:hover:bg-[#00212e]"
              >
                View Clip
              </button>
              <button
                onClick={() => { onEdit(clip); setMenuOpen(false); }}
                className="w-full text-left px-3 py-[7px] text-[0.75rem] font-semibold text-[#00212e] dark:text-white hover:bg-[#f9fdfe] dark:hover:bg-[#00212e]"
              >
                Edit Details
              </button>
              {/* Deleting footage is admin-only. The backend enforces this
                  independently; hiding the control just avoids offering an
                  action that would only come back as a 403. */}
              {canDelete && (
                <button
                  onClick={() => { onDelete(clip); setMenuOpen(false); }}
                  className="w-full text-left px-3 py-[7px] text-[0.75rem] font-semibold text-[#e11d48] dark:text-[#ff6b81] hover:bg-[#fff1f2] dark:hover:bg-[#ff4757]/10"
                >
                  Delete Clip
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoClipCard;
