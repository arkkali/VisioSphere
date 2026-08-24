// frontend/src/hooks/useVideoClips.js
//
// Return shape is intentionally identical to what pages/VideoClips.jsx
// destructures.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  eventTypes,
  fetchVideoClips,
  fetchThumbnailUrls,
  categoryForType,
  getCameraGroups,
  updateClip as updateClipRequest,
  deleteClip as deleteClipRequest,
} from '../services/videoClipsService';

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

/**
 * Sort orders offered in the toolbar.
 *
 * 'newest' stays the default: this is a monitoring archive, and the thing a
 * nurse coming on shift needs first is what happened most recently.
 */
export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'type',   label: 'Event type' },
  { id: 'severity', label: 'Most severe first' },
];

// Ranked so the orders that matter clinically sort first. Anything unlisted
// falls to the end rather than colliding at 0 with genuine emergencies.
const SEVERITY_RANK = { Fall: 0, 'Lying Down': 1, Agitation: 2, Inactivity: 3 };
const rankOf = (clip) =>
  SEVERITY_RANK[clip.eventType] ?? Number.MAX_SAFE_INTEGER;

const byTime = (a, b, dir) =>
  dir * (new Date(a.timestamp) - new Date(b.timestamp));

const comparatorFor = (sortBy) => {
  if (sortBy === 'oldest') return (a, b) => byTime(a, b, 1);
  if (sortBy === 'type') {
    return (a, b) =>
      String(a.eventType).localeCompare(String(b.eventType)) || byTime(a, b, -1);
  }
  if (sortBy === 'severity') {
    return (a, b) => rankOf(a) - rankOf(b) || byTime(a, b, -1);
  }
  return (a, b) => byTime(a, b, -1); // newest
};

const OTHER_GROUP_ID = '__other__';
const OTHER_GROUP_NAME = 'Other Cameras';

export function useVideoClips() {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedHouseId, setSelectedHouseId] = useState(ALL_HOUSES);
  const [activeEventType, setActiveEventType] = useState('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  // Ids ticked for bulk deletion. A Set, not an array: selection is membership,
  // and every render asks "is this card selected" once per card.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [selectionMode, setSelectionMode] = useState(false);

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

      // Thumbnails are fetched SEPARATELY and after the fact, on purpose. They
      // are decoration: the grid is fully usable with gradient placeholders, so
      // nothing here should delay showing it. A failure is swallowed for the
      // same reason -- a missing thumbnail must never surface as "unable to
      // load video clips" when the clips loaded perfectly well.
      if (items.length) {
        fetchThumbnailUrls(items.map((c) => c.id))
          .then((urls) => {
            if (!urls || !Object.keys(urls).length) return;
            setClips((prev) =>
              prev.map((c) => (urls[c.id] ? { ...c, thumbnail: urls[c.id] } : c))
            );
          })
          .catch((err) =>
            console.warn('[useVideoClips] thumbnails unavailable:', err?.message)
          );
      }
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

    // Sort within each group. Grouping is by camera and is not affected by the
    // chosen order — sorting across groups would flatten the layout the page is
    // built around.
    const compare = comparatorFor(sortBy);
    for (const bucket of buckets.values()) {
      bucket.clips.sort(compare);
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
  }, [clips, activeEventType, search, selectedHouseId, cameraGroups, sortBy]);

  /**
   * Apply a correction and patch the one clip in place.
   *
   * Not a full reload: re-fetching would rebuild every group, collapse any
   * "show more" the user had expanded, and re-request all the thumbnails --
   * a lot of visible churn for a one-field change. The server's response is
   * the source of truth for the new values, including the severity it derived.
   */
  const editClip = useCallback(async (clipId, changes) => {
    const updated = await updateClipRequest(clipId, changes);
    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId
          ? {
              ...c,
              rawIncidentType: updated.incidentType,
              eventType: categoryForType(updated.incidentType),
              note: updated.note || '',
            }
          : c
      )
    );
    return updated;
  }, []);

  /**
   * Delete a recording and drop its card.
   *
   * Only the CLIP is deleted; the incident record survives on the backend, so
   * the fall still counts in reports. It leaves this list because this list is
   * defined as "incidents that have a clip".
   */
  const removeClip = useCallback(async (clipId) => {
    await deleteClipRequest(clipId);
    setClips((prev) => prev.filter((c) => c.id !== clipId));
  }, []);

  // ---------------------------------------------------------------------
  // Selection (for bulk delete)
  // ---------------------------------------------------------------------
  const toggleSelected = useCallback((clipId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clipId)) next.delete(clipId);
      else next.add(clipId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  /** Tick every clip currently visible under the active filters. Deliberately
   *  scoped to what is on screen — "select all" that silently included clips
   *  hidden by a filter would delete things the user never saw. */
  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(groupedClips.flatMap((g) => g.clips.map((c) => c.id))));
  }, [groupedClips]);

  /**
   * Delete several recordings.
   *
   * Sequential, not Promise.all: each delete is a round trip to the mini PC
   * through the tunnel, and firing a dozen at once risks tripping the write
   * rate limiter — which would surface as random failures that look like data
   * loss. Slower and predictable beats faster and confusing here.
   *
   * Partial failure is reported honestly rather than swallowed. Only the clips
   * that actually deleted leave the grid; the rest stay, still selected, so a
   * retry is one click and nothing silently vanishes from the UI while its
   * file is still on disk.
   */
  const removeClips = useCallback(async (clipIds) => {
    const deleted = [];
    const failed = [];

    for (const id of clipIds) {
      try {
        await deleteClipRequest(id);
        deleted.push(id);
      } catch (err) {
        console.error('[useVideoClips] delete failed for', id, err);
        failed.push(id);
      }
    }

    if (deleted.length) {
      const gone = new Set(deleted);
      setClips((prev) => prev.filter((c) => !gone.has(c.id)));
    }
    setSelectedIds(new Set(failed));

    if (failed.length) {
      const err = new Error(
        deleted.length
          ? `Deleted ${deleted.length}, but ${failed.length} could not be removed. Those are still selected.`
          : `Could not delete ${failed.length} recording${failed.length > 1 ? 's' : ''}.`
      );
      err.partial = { deleted: deleted.length, failed: failed.length };
      throw err;
    }

    setSelectionMode(false);
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
    sortBy,
    setSortBy,
    sortOptions: SORT_OPTIONS,
    selectionMode,
    setSelectionMode,
    selectedIds,
    toggleSelected,
    clearSelection,
    exitSelectionMode,
    selectAllVisible,
    editClip,
    removeClip,
    removeClips,
    reload: loadClips,
  };
}

export default useVideoClips;
