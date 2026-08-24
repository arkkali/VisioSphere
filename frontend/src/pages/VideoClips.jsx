// frontend/src/pages/VideoClips.jsx
import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

import Sidebar from '../components/Sidebar';

import EventFilterPills from '../components/videoClips/EventFilterPills';
import VideoClipsToolbar from '../components/videoClips/VideoClipsToolbar';
import HouseSelector from '../components/videoClips/HouseSelector';
import VideoClipsGrid from '../components/videoClips/VideoClipsGrid';
import VideoPlayerModal from '../components/videoClips/VideoPlayerModal';
import EditClipModal from '../components/videoClips/EditClipModal';
import DeleteClipDialog from '../components/videoClips/DeleteClipDialog';

import { useVideoClips } from '../hooks/useVideoClips';
import { canDeleteClips } from '../services/videoClipsService';

const VideoClips = () => {
  const location = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');

  // Currently-open clip in the playback modal. null = modal closed.
  const [selectedClip, setSelectedClip] = useState(null);
  const [editingClip, setEditingClip] = useState(null);
  // Holds whatever is pending deletion: one clip from the row menu, or the
  // whole selection. One dialog handles both.
  const [pendingDelete, setPendingDelete] = useState(null);

  // Read once per mount. The backend enforces this independently on
  // DELETE /incidents/:id/clip; this only decides whether to offer the
  // control, so a tampered localStorage buys nothing but a 403.
  const canDelete = useMemo(() => canDeleteClips(), []);

  const {
    loading,
    error,
    houses,
    selectedHouseId,
    setSelectedHouseId,
    eventTypes,
    activeEventType,
    setActiveEventType,
    search,
    setSearch,
    dateRangeLabel,
    groupedClips,     // [{ houseId, houseName, clips: [...] }] — already filtered
    visibleCounts,    // { [houseId]: number } — cards to show before "show more"
    showMoreForHouse, // (houseId) => void
    sortBy,
    setSortBy,
    sortOptions,
    selectionMode,
    setSelectionMode,
    selectedIds,
    toggleSelected,
    exitSelectionMode,
    selectAllVisible,
    editClip,         // (id, { incidentType, note }) => Promise
    removeClips,      // (ids[]) => Promise
  } = useVideoClips();

  // Flattened once so the selection bar can count, and so the confirm dialog
  // can list what is about to go by name rather than just a number.
  const visibleClips = useMemo(
    () => groupedClips.flatMap((g) => g.clips),
    [groupedClips]
  );
  const selectedClips = useMemo(
    () => visibleClips.filter((c) => selectedIds.has(c.id)),
    [visibleClips, selectedIds]
  );

  return (
    <div className="flex bg-[#f1f5f9] dark:bg-[#1c2c2f] h-screen w-screen overflow-hidden font-['Outfit',sans-serif] transition-colors duration-300">
      <Sidebar />

      <main className="flex-1 ml-0 md:ml-[250px] p-4 flex flex-col h-full overflow-hidden gap-3">
        <div className="flex-1 bg-white dark:bg-[#00212e] rounded-[24px] shadow-sm border border-[#e2e8f0] dark:border-[#00435c] overflow-hidden flex flex-col">

          {/* Header + controls */}
          <div className="p-5 lg:p-6 pb-4 shrink-0 border-b border-[#f1f5f9] dark:border-[#00435c]">
            <h1 className="text-[1.4rem] text-[#00212e] dark:text-white m-0 font-black tracking-tight leading-none">
              Video Clips
            </h1>
            <p className="text-[0.8rem] text-[#5a6265] dark:text-[#668894] font-semibold m-0 mt-1.5 leading-none">
              Review and analyze detected events from your cameras.
            </p>

            <div className="mt-4">
              <EventFilterPills
                eventTypes={eventTypes}
                activeEventType={activeEventType}
                onChange={setActiveEventType}
              />
            </div>

            <div className="mt-3">
              <VideoClipsToolbar
                search={search}
                onSearchChange={setSearch}
                dateRangeLabel={dateRangeLabel}
                sortBy={sortBy}
                onSortChange={setSortBy}
                sortOptions={sortOptions}
              />
            </div>

            <div className="mt-4">
              <HouseSelector
                houses={houses}
                selectedHouseId={selectedHouseId}
                onSelect={setSelectedHouseId}
                showManageCctv={!isNurseView}
              />
            </div>
          </div>

          {/* Selection bar. Only rendered for users who may actually delete —
              offering "Select" to someone whose every delete returns 403 is
              worse than not offering it. */}
          {canDelete && (
            <div className="px-5 lg:px-6 pb-3 shrink-0">
              {selectionMode ? (
                <div className="flex items-center justify-between gap-3 flex-wrap py-2.5 px-3.5 rounded-[12px] bg-[#eaf8fe] dark:bg-[#0075a2]/20 border border-[#00a8e8]/40">
                  <p className="m-0 text-[0.78rem] font-bold text-[#00212e] dark:text-white">
                    {selectedIds.size} selected
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={selectAllVisible}
                      className="py-[7px] px-[12px] rounded-[10px] text-[0.75rem] font-bold text-[#00212e] dark:text-white bg-white dark:bg-[#00212e] border border-[#e2e8f0] dark:border-[#00435c] hover:border-[#00a8e8]/60 transition-colors"
                    >
                      Select all shown
                    </button>
                    <button
                      onClick={exitSelectionMode}
                      className="py-[7px] px-[12px] rounded-[10px] text-[0.75rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] bg-white dark:bg-[#00212e] border border-[#e2e8f0] dark:border-[#00435c] hover:border-[#00a8e8]/60 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setPendingDelete(selectedClips)}
                      disabled={selectedIds.size === 0}
                      className="py-[7px] px-[14px] rounded-[10px] text-[0.75rem] font-bold text-white bg-[#e11d48] hover:bg-[#be123c] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete Selected
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setSelectionMode(true)}
                  className="flex items-center gap-2 py-[8px] px-[13px] rounded-[10px] text-[0.75rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] bg-white dark:bg-[#00212e] border border-[#e2e8f0] dark:border-[#00435c] hover:border-[#00a8e8]/60 hover:text-[#00a8e8] transition-colors"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 11 12 14 22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  Select to delete
                </button>
              )}
            </div>
          )}

          {/* Clip grid */}
          <div className="flex-1 overflow-y-auto p-5 lg:p-6 pt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full p-8">
                <div className="w-10 h-10 border-4 border-[#00a8e8] border-t-transparent rounded-full animate-spin" />
                <p className="mt-3 font-bold text-[#5a6265] dark:text-[#a6aeb2] text-sm">
                  Loading clips...
                </p>
              </div>
            ) : error ? (
              <div className="bg-[#fff1f2] dark:bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#e11d48] dark:text-[#ff4757] px-4 py-3 rounded-xl">
                <p className="m-0 font-semibold text-sm">{error}</p>
              </div>
            ) : groupedClips.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <p className="m-0 font-bold text-[#00212e] dark:text-white text-sm">
                  No clips found
                </p>
                <p className="m-0 mt-1 text-xs text-[#5a6265] dark:text-[#668894] font-medium">
                  Try adjusting your filters or search.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {groupedClips.map((group) => (
                  <VideoClipsGrid
                    key={group.houseId}
                    houseName={group.houseName}
                    clips={group.clips}
                    visibleCount={visibleCounts[group.houseId] || 6}
                    onShowMore={() => showMoreForHouse(group.houseId)}
                    onSelectClip={setSelectedClip}
                    onEditClip={setEditingClip}
                    onDeleteClip={setPendingDelete}
                    canDelete={canDelete}
                    selectionMode={selectionMode}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelected}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <VideoPlayerModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
      <EditClipModal
        clip={editingClip}
        onClose={() => setEditingClip(null)}
        onSave={editClip}
      />
      <DeleteClipDialog
        clips={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={removeClips}
      />
    </div>
  );
};

export default VideoClips;
