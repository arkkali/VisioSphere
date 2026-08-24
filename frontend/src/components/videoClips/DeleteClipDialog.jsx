// frontend/src/components/videoClips/DeleteClipDialog.jsx
//
// A plain confirm() would be cheaper, but this deletes CCTV footage of a
// detected fall from a care facility. The dialog is explicit about two things
// people get wrong about that:
//
//   1. It is PERMANENT. The file is removed from the recorder's disk; there is
//      no soft-delete and no undo.
//   2. The INCIDENT SURVIVES. Deleting the video does not delete the fall from
//      the reports. Staff who assume otherwise might delete footage expecting
//      the event to disappear from the statistics — it will not, and that is
//      deliberate.

import React, { useState } from 'react';

const DeleteClipDialog = ({ clip, onClose, onConfirm }) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  if (!clip) return null;

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm(clip.id);
      onClose();
    } catch (err) {
      console.error('[DeleteClipDialog] delete failed:', err);
      setError(
        err?.response?.data?.message ||
        'Could not delete the recording. The recorder may be offline — the clip has not been removed.'
      );
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2100] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-2xl w-full max-w-[420px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-start gap-3">
          <span className="shrink-0 w-[38px] h-[38px] rounded-full bg-[#fff1f2] dark:bg-[#ff4757]/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#e11d48" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="m-0 font-black text-[#00212e] dark:text-white text-sm">
              Delete this recording?
            </p>
            <p className="m-0 mt-1 text-xs text-[#5a6265] dark:text-[#a6aeb2] font-semibold">
              {clip.eventType} · {clip.dateLabel} · {clip.timeLabel} · {clip.cameraName}
            </p>
            <p className="m-0 mt-2.5 text-[0.76rem] text-[#5a6265] dark:text-[#a6aeb2] font-medium leading-relaxed">
              The video file is permanently removed from the recorder. This
              cannot be undone.
            </p>
            <p className="m-0 mt-2 text-[0.76rem] text-[#5a6265] dark:text-[#a6aeb2] font-medium leading-relaxed">
              The event itself stays in the records and continues to count in
              reports — only the footage is deleted. Your name and the time are
              written to the audit trail.
            </p>
          </div>
        </div>

        {error && (
          <div className="mx-5 mb-1 bg-[#fff1f2] dark:bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#e11d48] dark:text-[#ff4757] px-3 py-2 rounded-[10px]">
            <p className="m-0 font-semibold text-xs">{error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 mt-2 border-t border-[#f1f5f9] dark:border-[#00435c]">
          <button
            onClick={onClose}
            disabled={deleting}
            className="py-[9px] px-[16px] rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.78rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={deleting}
            className="py-[9px] px-[18px] rounded-[12px] bg-[#e11d48] text-white text-[0.78rem] font-bold hover:bg-[#be123c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting…' : 'Delete Recording'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteClipDialog;
