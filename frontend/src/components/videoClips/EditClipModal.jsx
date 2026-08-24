// frontend/src/components/videoClips/EditClipModal.jsx
//
// "Editing a clip" is a slight misnomer worth being explicit about: the video
// file is immutable evidence and nothing here touches it. What this edits is
// the RECORD attached to the recording — what the event was classified as, and
// any note a reviewer wants to leave. That is the part that is ever actually
// wrong: the detector labels a resident lowering themselves into a chair as a
// fall, and the nurse who watched the clip knows better.
//
// Changing the type also moves severity server-side (see
// incidentService.SEVERITY_FOR_TYPE), so the dashboard totals follow the
// correction instead of continuing to report the mistake.

import React, { useState } from 'react';
import { INCIDENT_TYPES } from '../../services/videoClipsService';

const NOTE_LIMIT = 500;

const EditClipModal = ({ clip, onClose, onSave }) => {
  const [incidentType, setIncidentType] = useState(clip?.rawIncidentType || '');
  const [note, setNote] = useState(clip?.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  if (!clip) return null;

  const dirty =
    incidentType !== (clip.rawIncidentType || '') || note !== (clip.note || '');

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(clip.id, { incidentType, note });
      onClose();
    } catch (err) {
      console.error('[EditClipModal] save failed:', err);
      setError(
        err?.response?.data?.message ||
        'Could not save the change. Please try again.'
      );
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2100] bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#00212e] rounded-[20px] shadow-2xl w-full max-w-[440px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-[#f1f5f9] dark:border-[#00435c]">
          <p className="m-0 font-black text-[#00212e] dark:text-white text-sm">
            Edit Clip Details
          </p>
          <p className="m-0 text-xs text-[#5a6265] dark:text-[#a6aeb2] font-semibold mt-0.5">
            {clip.dateLabel} · {clip.timeLabel} · {clip.cameraName}
          </p>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          <div>
            <label
              htmlFor="clip-event-type"
              className="block mb-1.5 text-[0.72rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] uppercase tracking-wide"
            >
              Event Type
            </label>
            <select
              id="clip-event-type"
              value={incidentType}
              onChange={(e) => setIncidentType(e.target.value)}
              className="w-full py-[10px] px-3 rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00344a] text-[0.82rem] font-semibold text-[#00212e] dark:text-white outline-none focus:border-[#00a8e8] transition-colors"
            >
              {INCIDENT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <p className="m-0 mt-1.5 text-[0.68rem] text-[#9dabb1] dark:text-[#668894] font-medium">
              Changing this updates the event's severity and the dashboard
              totals. The recording itself is not modified.
            </p>
          </div>

          <div>
            <label
              htmlFor="clip-note"
              className="block mb-1.5 text-[0.72rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] uppercase tracking-wide"
            >
              Note <span className="font-semibold normal-case">(optional)</span>
            </label>
            <textarea
              id="clip-note"
              value={note}
              maxLength={NOTE_LIMIT}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Resident sat down heavily, no fall occurred."
              className="w-full py-[10px] px-3 rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00344a] text-[0.82rem] font-medium text-[#00212e] dark:text-white placeholder:text-[#9dabb1] dark:placeholder:text-[#668894] outline-none focus:border-[#00a8e8] transition-colors resize-none"
            />
            <p className="m-0 mt-1 text-[0.68rem] text-[#9dabb1] dark:text-[#668894] font-medium text-right">
              {note.length}/{NOTE_LIMIT}
            </p>
          </div>

          {error && (
            <div className="bg-[#fff1f2] dark:bg-[#ff4757]/20 border border-[#ff4757]/30 text-[#e11d48] dark:text-[#ff4757] px-3 py-2 rounded-[10px]">
              <p className="m-0 font-semibold text-xs">{error}</p>
            </div>
          )}

          <p className="m-0 text-[0.68rem] text-[#9dabb1] dark:text-[#668894] font-medium">
            This change is recorded in the audit trail with your name and the
            previous values.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#f1f5f9] dark:border-[#00435c]">
          <button
            onClick={onClose}
            disabled={saving}
            className="py-[9px] px-[16px] rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.78rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="py-[9px] px-[18px] rounded-[12px] bg-[#00a8e8] text-white text-[0.78rem] font-bold hover:bg-[#0090c7] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditClipModal;
