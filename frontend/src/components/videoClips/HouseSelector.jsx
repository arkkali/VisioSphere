// frontend/src/components/videoClips/HouseSelector.jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';

// Dot colors per house are assigned in order from this palette so each
// house gets a distinct, stable color without needing a color field
// on the house data itself.
const HOUSE_DOT_COLORS = ['bg-[#00a8e8]', 'bg-[#22c55e]', 'bg-[#a855f7]', 'bg-[#f97316]', 'bg-[#eab308]'];

// `actions` is rendered on the right, beside Manage CCTV. The clip-selection
// controls live there rather than in their own row: they act on the same set
// of clips the house pills choose, so keeping them on one line ties the two
// together and saves a band of vertical space above the grid.
const HouseSelector = ({ houses, selectedHouseId, onSelect, showManageCctv, actions }) => {
  const navigate = useNavigate();

  return (
    <div className="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <p className="m-0 mb-2 text-[0.72rem] font-bold text-[#5a6265] dark:text-[#a6aeb2] uppercase tracking-wide">
          Select House/Camera:
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onSelect('all')}
            className={`flex items-center gap-1.5 py-[7px] px-[14px] rounded-full text-[0.78rem] font-bold whitespace-nowrap border transition-all duration-150 ${
              selectedHouseId === 'all'
                ? 'bg-[#00a8e8] border-[#00a8e8] text-white'
                : 'bg-white dark:bg-[#00212e] border-[#e2e8f0] dark:border-[#00435c] text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50'
            }`}
          >
            All Locations
          </button>

          {houses.map((house, i) => {
            const isActive = selectedHouseId === house.id;
            const dotColor = HOUSE_DOT_COLORS[i % HOUSE_DOT_COLORS.length];
            return (
              <button
                key={house.id}
                onClick={() => onSelect(house.id)}
                className={`flex items-center gap-2 py-[7px] px-[14px] rounded-full text-[0.78rem] font-bold whitespace-nowrap border transition-all duration-150 ${
                  isActive
                    ? 'bg-[#eaf8fe] dark:bg-[#0075a2]/30 border-[#00a8e8] text-[#00212e] dark:text-white'
                    : 'bg-white dark:bg-[#00212e] border-[#e2e8f0] dark:border-[#00435c] text-[#5a6265] dark:text-[#a6aeb2] hover:border-[#00a8e8]/50'
                }`}
              >
                <span className={`w-[8px] h-[8px] rounded-full shrink-0 ${dotColor}`} />
                {house.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {actions}

        {showManageCctv && (
        <button
          onClick={() => navigate('/admin/monitoring')}
          className="flex items-center gap-2 py-[9px] px-[14px] rounded-[12px] border border-[#e2e8f0] dark:border-[#00435c] bg-white dark:bg-[#00212e] text-[0.78rem] font-bold text-[#00212e] dark:text-white whitespace-nowrap hover:border-[#00a8e8]/50 transition-colors shrink-0"
        >
          <svg className="w-4 h-4 text-[#5a6265] dark:text-[#a6aeb2]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
          Manage CCTV
        </button>
        )}
      </div>
    </div>
  );
};

export default HouseSelector;
