// frontend/src/components/videoClips/EventFilterPills.jsx
import React from 'react';

// Matches the incident categories already used in AdminDashboard.jsx
// (incidentTypeToCategory) so clip filtering speaks the same vocabulary
// as the rest of the app's alert/incident system.
const DOT_COLORS = {
  all:          'bg-[#94a3b8]',
  Fall:         'bg-[#ef4444]',
  Agitation:    'bg-[#a855f7]',
  'Lying Down': 'bg-[#3b82f6]',
  Inactivity:   'bg-[#eab308]',
};

const EventFilterPills = ({ eventTypes, activeEventType, onChange }) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {eventTypes.map((type) => {
        const isActive = activeEventType === type.id;
        const dotColor = DOT_COLORS[type.id] || 'bg-[#94a3b8]';

        return (
          <button
            key={type.id}
            onClick={() => onChange(type.id)}
            className={`flex items-center gap-2 shrink-0 py-[7px] px-[14px] rounded-full text-[0.78rem] font-bold whitespace-nowrap border transition-all duration-150 ${
              isActive
                ? 'bg-[#eaf8fe] dark:bg-[#0075a2]/30 border-[#00a8e8] text-[#00212e] dark:text-white'
                : 'bg-white dark:bg-[#00212e] border-[#e2e8f0] dark:border-[#00435c] text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50'
            }`}
          >
            <span className={`w-[8px] h-[8px] rounded-full shrink-0 ${dotColor}`} />
            {type.label}
          </button>
        );
      })}
    </div>
  );
};

export default EventFilterPills;
