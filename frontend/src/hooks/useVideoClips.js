// frontend/src/hooks/useVideoClips.js
//
// Return shape is intentionally identical to what pages/VideoClips.jsx
// destructures.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  eventTypes,
  fetchVideoClips,
  getCameraGroups,
} from '../services/videoClipsService';

const DEFAULT_VISIBLE_COUNT = 6;
const SHOW_MORE_INCREMENT = 6;

// Matches the backend's own default window when `since` is omitted (see
// incidentService.js getIncidents: `since ? new Date(since) : new
// Date(Date.now() - 7*24*60*60*1000)`). Kept as a plain label rather than a
// live picker — there is no date-range control in the toolbar to wire it to.
const DATE_RANGE_LABEL = 'Last 7 Days';

// Sentinel for "no house filter". HouseSelector's "All Locations" button calls
// onSelect('all'), so 'all' — not null — is the value that must mean unfiltered.
// The original handoff initialised this to null and filtered with a bare
// `if (selectedHouseId)`, which meant clicking "All Locations" set it to the
// truthy string 'all' and then filtered for a group whose houseId was literally
// 'all'. No such group exists, so the page went blank. Both halves are fixed
// here: 'all' is the initial value (so the button renders active on load) and
// the filter below explicitly excludes it.
const ALL_HOUSES = 'all';

const OTHER_GROUP_ID = '__other__';
const OTHER_GROUP_NAME = 'Other Cameras';

export function useVideoClips() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedHouseId, setSelectedHouseId] = useState(ALL_HOUSES);
  const [activeEventType, setActiveEventType] = useState('all');
  const [search, setSearch] = useState('');
  const [visibleCounts, setVisibleCounts] = useState({});

  // Camera groups for the current facility — resolved once; a user is not
  // reassigned to a different facility mid-session without a fresh login,
  // which would remount everything anyway.
  const cameraGroups = useMemo(() => getCameraGroups(), []);

  const houses = useMemo(
    () => cameraGroups.map((g) => ({ id: g.groupId, name: g.groupName })),
    [cameraGroups]
  );

  const loadClips = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchVideoClips();
      setClips(items);
    } catch (err) {
      console.error('[useVideoClips] failed to load clips:', err);
      setError('Unable to load video clips. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  // ---------------------------------------------------------------------
  // Filter -> group -> sort pipeline
  // ---------------------------------------------------------------------
  const groupedClips = useMemo(() => {
    const query = search.trim().toLowerCase();

    const filtered = clips.filter((clip) => {
      if (activeEventType !== 'all' && clip.eventType !== activeEventType) {
        return false;
      }
      if (query) {
        const haystack = `${clip.eventType} ${clip.cameraName} ${clip.dateLabel}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    // Map from ai_core feedId -> the camera group it belongs to.
    const feedIdToGroup = new Map(cameraGroups.map((g) => [g.feedId, g]));

    const buckets = new Map(
      cameraGroups.map((g) => [g.groupId, { houseId: g.groupId, houseName: g.groupName, clips: [] }])
    );

    let hasOther = false;
    for (const clip of filtered) {
      const group = feedIdToGroup.get(clip.cameraName);
      if (group) {
        buckets.get(group.groupId).clips.push(clip);
      } else {
        // Unrecognised camera (e.g. a historical incident from a camera no
        // longer configured, or a cam_id in ai_core/.env that doesn't match
        // constants/cameras.js). Kept visible rather than silently dropped —
        // a clip vanishing without trace is worse than an odd group heading,
        // and this grouping is cosmetic: the backend already decided which
        // incidents this user may see at all.
        if (!buckets.has(OTHER_GROUP_ID)) {
          buckets.set(OTHER_GROUP_ID, { houseId: OTHER_GROUP_ID, houseName: OTHER_GROUP_NAME, clips: [] });
        }
        buckets.get(OTHER_GROUP_ID).clips.push(clip);
        hasOther = true;
      }
    }

    // Newest first within each group.
    for (const bucket of buckets.values()) {
      bucket.clips.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    let groups = Array.from(buckets.values()).filter((g) => g.clips.length > 0);

    // "Other Cameras" always last, regardless of Map insertion order.
    if (hasOther) {
      groups = [
        ...groups.filter((g) => g.houseId !== OTHER_GROUP_ID),
        ...groups.filter((g) => g.houseId === OTHER_GROUP_ID),
      ];
    }

    if (selectedHouseId && selectedHouseId !== ALL_HOUSES) {
      groups = groups.filter((g) => g.houseId === selectedHouseId);
    }

    return groups;
  }, [clips, activeEventType, search, selectedHouseId, cameraGroups]);

  const showMoreForHouse = useCallback((houseId) => {
    setVisibleCounts((prev) => ({
      ...prev,
      [houseId]: (prev[houseId] || DEFAULT_VISIBLE_COUNT) + SHOW_MORE_INCREMENT,
    }));
  }, []);

  return {
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
    dateRangeLabel: DATE_RANGE_LABEL,
    groupedClips,
    visibleCounts,
    showMoreForHouse,
    reload: loadClips,
  };
}

export default useVideoClips;
