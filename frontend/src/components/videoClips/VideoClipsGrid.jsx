// frontend/src/components/videoClips/VideoClipsGrid.jsx
import React from 'react';
import VideoClipCard from './VideoClipCard';

// One house's section: a heading plus a grid of clip cards.
//
// There used to be a "show more" chevron beside each row that revealed six more
// clips at a time. It was removed: the panel already scrolls, so the arrow
// added a second, less obvious way to reach content the user could simply
// scroll to — and it hid clips behind a click for no benefit. Every clip that
// passes the filters is rendered.
const VideoClipsGrid = ({
  houseName,
  clips,
  onSelectClip,
  onEditClip,
  onDeleteClip,
  canDelete,
  selectionMode,
  selectedIds,
  onToggleSelect,
}) => {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-[8px] h-[8px] rounded-full bg-[#00a8e8] shrink-0" />
        <h2 className="m-0 text-[0.9rem] font-black text-[#00212e] dark:text-white">
          {houseName}
        </h2>
        <span className="text-[0.72rem] font-semibold text-[#9dabb1] dark:text-[#668894]">
          {clips.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {clips.map((clip) => (
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
    </div>
  );
};

export default VideoClipsGrid;
