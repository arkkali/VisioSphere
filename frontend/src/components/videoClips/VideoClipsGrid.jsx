// frontend/src/components/videoClips/VideoClipsGrid.jsx
import React from 'react';
import VideoClipCard from './VideoClipCard';

// Renders one house's section: a heading + a grid of clip cards, with a
// "show more" arrow if there are more clips than currently visible.
// Matches the Figma's 3-column grid with a right-side chevron per row.
const VideoClipsGrid = ({
  houseName,
  clips,
  visibleCount,
  onShowMore,
  onSelectClip,
  onEditClip,
  onDeleteClip,
  canDelete,
  selectionMode,
  selectedIds,
  onToggleSelect,
}) => {
  const visibleClips = clips.slice(0, visibleCount);
  const hasMore = clips.length > visibleCount;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-[8px] h-[8px] rounded-full bg-[#00a8e8] shrink-0" />
        <h2 className="m-0 text-[0.9rem] font-black text-[#00212e] dark:text-white">
          {houseName}
        </h2>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleClips.map((clip) => (
            <VideoClipCard
              key={clip.id}
              clip={clip}
              onSelect={onSelectClip}
              onEdit={onEditClip}
              onDelete={onDeleteClip}
              canDelete={canDelete}
              selectionMode={selectionMode}
              selected={selectedIds?.has(clip.id) || false}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>

        {hasMore && (
          <button
            onClick={onShowMore}
            className="shrink-0 mt-[70px] w-[34px] h-[34px] rounded-full bg-white dark:bg-[#00435c] border border-[#e2e8f0] dark:border-[#00567a] shadow-sm flex items-center justify-center text-[#5a6265] dark:text-[#a6aeb2] hover:bg-[#eaf8fe] dark:hover:bg-[#0075a2]/30 hover:text-[#00a8e8] transition-colors"
            aria-label={`Show more clips from ${houseName}`}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoClipsGrid;
