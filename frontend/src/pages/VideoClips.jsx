// frontend/src/pages/VideoClips.jsx
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';

import Sidebar from '../components/Sidebar';

import EventFilterPills from '../components/videoClips/EventFilterPills';
import VideoClipsToolbar from '../components/videoClips/VideoClipsToolbar';
import HouseSelector from '../components/videoClips/HouseSelector';
import VideoClipsGrid from '../components/videoClips/VideoClipsGrid';
import VideoPlayerModal from '../components/videoClips/VideoPlayerModal';

import { useVideoClips } from '../hooks/useVideoClips';

const VideoClips = () => {
  const location = useLocation();
  const isNurseView = location.pathname.startsWith('/nurse');

  // Currently-open clip in the playback modal. null = modal closed.
  const [selectedClip, setSelectedClip] = useState(null);

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
  } = useVideoClips();

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
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      <VideoPlayerModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
    </div>
  );
};

export default VideoClips;
