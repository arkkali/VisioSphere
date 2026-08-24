// frontend/src/components/videoClips/DeleteClipDialog.jsx
//
// Handles one clip or many. A plain confirm() would be cheaper, but this
// deletes CCTV footage of detected falls from a care facility, and the dialog
// is explicit about the two things people get wrong about that:
//
//   1. It is PERMANENT. The files are removed from the recorder's disk; there
//      is no soft-delete and no undo.
//   2. The INCIDENTS SURVIVE. Deleting footage does not remove the falls from
//      the reports. Staff who assume otherwise might delete recordings
//      expecting the events to disappear from the statistics — they will not,
//      and that is deliberate.

import React, { useState, useRef, useEffect } from 'react';

const DeleteClipDialog = ({ clips, onClose, onConfirm }) => {
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(null); // { current, total }
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  // If the dialog unmounts mid-delete, abort rather than leaving a request
  // pending against a component that no longer exists.
  useEffect(() => () => abortRef.current?.abort(), []);

  // Accepts a single clip or an array, so the same dialog serves the row menu
  // and bulk selection. One confirmation path means one place where the
  // warning wording can drift out of date.
  const list = !clips ? [] : Array.isArray(clips) ? clips : [clips];
  if (!list.length) return null;

  const many = list.length > 1;

  const handleConfirm = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setDeleting(true);
    setProgress(null);
    setError(null);
    try {
      await onConfirm(list.map((c) => c.id), {
        signal: controller.signal,
        onProgress: (current, total) =>
          setProgress(total > 1 ? { current, total } : null),
      });
      // Reset before closing. The page now mounts this per open, so a stale
      // flag can no longer strand the next delete — but leaving state dirty on
      // the success path is what caused that bug, and a component should not
      // depend on its parent unmounting it to stay correct.
      setDeleting(false);
      setProgress(null);
      onClose();
    } catch (err) {
      if (controller.signal.aborted) return; // user backed out; nothing to report
      console.error('[DeleteClipDialog] delete failed:', err);
      setError(
        err?.message ||
        err?.response?.data?.message ||
        'Could not delete. The recorder may be offline — nothing was removed.'
      );
      setDeleting(false);
      setProgress(null);
    }
  };

  // Cancel stays live DURING the delete, on purpose. It was disabled while
  // `deleting` was true, which meant a stalled request — an unreachable
  // recorder, a cold backend — left the dialog spinning on "Deleting…" with
  // every control dead and no way out but a page reload. A destructive
  // operation is exactly the wrong place to trap someone. Aborting cannot
  // un-delete files already removed, so the wording below says so.
  const handleCancel = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[2100] bg-black/70 flex items-center justify-center p-4"
      onClick={handleCancel}
    >
      <div
        className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-2xl w-full max-w-[440px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-start gap-3">
          <span className="shrink-0 w-[38px] h-[38px] rounded-full bg-[#fff1f2] dark:bg-[#ff4757]/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="m-0 font-black text-[#00212e] dark:text-white text-sm">
              {many ? `Delete ${list.length} recordings?` : 'Delete this recording?'}
            </p>

            {many ? (
              <div className="mt-2 max-h-[132px] overflow-y-auto pr-1">
                {list.map((c) => (
                  <p key={c.id} className="m-0 text-[0.72rem] text-[#5a6265] dark:text-[#a6aeb2] font-semibold leading-relaxed">
                    {c.eventType} · {c.dateLabel} · {c.timeLabel}
                  </p>
                ))}
              </div>
            ) : (
              <p className="m-0 mt-1 text-xs text-[#5a6265] dark:text-[#a6aeb2] font-semibold">
                {list[0].eventType} · {list[0].dateLabel} · {list[0].timeLabel} · {list[0].cameraName}
              </p>
            )}

            <p className="m-0 mt-2.5 text-[0.76rem] text-[#5a6265] dark:text-[#a6aeb2] font-medium leading-relaxed">
              {many ? 'These video files are' : 'The video file is'} permanently
              removed from the recorder. This cannot be undone.
            </p>
            <p className="m-0 mt-2 text-[0.76rem] text-[#5a6265] dark:text-[#a6aeb2] font-medium leading-relaxed">
              {many ? 'The events themselves stay' : 'The event itself stays'} in
              the records and {many ? 'continue' : 'continues'} to count in
              reports — only the footage is deleted. Your name and the time are
              written to the audit trail.
            </p>
          </div>
        </div>

        {deleting && (
          <p className="m-0 px-5 pb-1 text-[0.68rem] text-[#9dabb1] dark:text-[#668894] font-medium">
            Stopping will not restore recordings already deleted.
          </p>
        )}

        {error && (
          <div className="mx-5 mb-1 bg-[#fff1f2] dark:bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#e11d48] dark:text-[#ff4757] px-3 py-2 rounded-[10px]">
            <p className="m-0 font-semibold text-xs">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 mt-2 border-t border-[#f1f5f9] dark:border-[#00435c]">
          <button
            onClick={handleCancel}
            className="py-[9px] px-[16px] rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.78rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50 transition-colors"
          >
            {deleting ? 'Stop' : 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="py-[9px] px-[18px] rounded-[12px] bg-[#e11d48] text-white text-[0.78rem] font-bold hover:bg-[#be123c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting
              ? (progress ? `Deleting ${progress.current} of ${progress.total}…` : 'Deleting…')
              : many ? `Delete ${list.length} Recordings` : 'Delete Recording'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteClipDialog;
