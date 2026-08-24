// frontend/src/components/videoClips/VideoPlayerModal.jsx
//
// clip.videoUrl is never used directly. videoClipsService.js deliberately
// leaves it null (see mapIncidentToClip) — the playable URL is resolved here,
// on open, via getClipVideoUrl(), so a signed token is minted only for a clip
// someone actually opens rather than for every card in a list being browsed.
//
// Per-clip state (resolvedUrl/urlLoading/urlError/duration) lives in a small
// internal ClipPlayer mounted with key={clip.id}. React remounts it fresh on
// every clip change, and that remount is what resets the state — not manual
// setState calls inside an effect. This avoids the pattern ESLint's
// react-hooks/set-state-in-effect rule flags. See
// https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes

import React, { useRef, useEffect, useState } from 'react';
import { getClipVideoUrl } from '../../services/videoClipsService';

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return null;
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Everything that depends on WHICH clip is open lives here. Mounted fresh via
 * key={clip.id} every time the selected clip changes, so no effect needs to
 * reset anything before it starts fetching.
 */
const ClipPlayer = ({ clip, onClose }) => {
  const videoRef = useRef(null);

  // Starts true, not reset to true inside an effect: a fresh mount of this
  // component IS the start of loading for this clip — a different clip gets a
  // different component instance entirely.
  const [urlLoading, setUrlLoading] = useState(true);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [urlError, setUrlError] = useState(null);
  const [duration, setDuration] = useState(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getClipVideoUrl(clip.id)
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          // Not an error — the incident exists but its clip isn't ready yet
          // (ai_core's cctv_alert fires before cctv_alert_clip, so there is a
          // real window where this is expected) or the file went missing on
          // disk. Say so plainly rather than showing a broken player.
          setUrlError('This clip is not available yet.');
        } else {
          setResolvedUrl(result.url);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[VideoPlayerModal] failed to resolve video URL:', err);
        setUrlError('Unable to load this video. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setUrlLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clip]);

  // Autoplay once the ACTUAL resolved URL is ready — the <video> element has
  // nothing to play until then.
  useEffect(() => {
    if (resolvedUrl && videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {
        // Autoplay can be blocked by the browser — the user can press play.
      });
    }
  }, [resolvedUrl]);

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(formatDuration(videoRef.current.duration));
    }
  };

  // A decode failure is worth calling out specifically. If ai_core fell back to
  // the mp4v codec (no H.264 encoder in its OpenCV build) the file downloads
  // fine and then renders as a black box, which otherwise looks like a network
  // problem and sends people debugging the wrong layer.
  const handleError = () => setPlaybackFailed(true);

  return (
    <div
      className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-2xl w-full max-w-[720px] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#f1f5f9] dark:border-[#00435c]">
        <div>
          <p className="m-0 font-black text-[#00212e] dark:text-white text-sm">
            {clip.eventType} {clip.eventType !== 'Inactivity' ? 'Detected' : ''}
          </p>
          <p className="m-0 text-xs text-[#5a6265] dark:text-[#a6aeb2] font-semibold mt-0.5">
            {clip.dateLabel} · {clip.timeLabel} · {clip.cameraName}
            {duration ? ` · ${duration}` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="w-[30px] h-[30px] flex items-center justify-center rounded-full text-[#5a6265] dark:text-[#a6aeb2] hover:bg-[#f1f5f9] dark:hover:bg-[#00435c] transition-colors"
          aria-label="Close video player"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <div className="bg-black aspect-video flex items-center justify-center">
        {urlLoading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-4 border-[#00a8e8] border-t-transparent rounded-full animate-spin" />
            <p className="m-0 text-white text-xs font-semibold">Loading video…</p>
          </div>
        ) : urlError ? (
          <p className="m-0 text-white text-sm font-semibold px-6 text-center">{urlError}</p>
        ) : playbackFailed ? (
          <p className="m-0 text-white text-sm font-semibold px-6 text-center">
            This clip could not be played. It may be recorded in a format this
            browser cannot decode — check the ai_core log for a codec warning.
          </p>
        ) : resolvedUrl ? (
          <video
            ref={videoRef}
            src={resolvedUrl}
            controls
            loop
            onLoadedMetadata={handleLoadedMetadata}
            onError={handleError}
            className="w-full h-full"
          >
            Your browser does not support video playback.
          </video>
        ) : null}
      </div>
    </div>
  );
};

const VideoPlayerModal = ({ clip, onClose }) => {
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (clip) document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [clip, onClose]);

  if (!clip) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <ClipPlayer key={clip.id} clip={clip} onClose={onClose} />
    </div>
  );
};

export default VideoPlayerModal;
