const CameraButton = ({ cameraName, isActive, onClick, status }) => (
  <button
    className={`px-4 py-2 rounded-full border text-xs font-bold flex items-center gap-2 transition-all duration-200 whitespace-nowrap ${isActive ? 'bg-[#00a8e8] dark:bg-[#0284c7] text-white border-[#00a8e8] dark:border-[#0284c7] shadow-md' : 'bg-white dark:bg-slate-800 text-[#2d6180] dark:text-slate-300 border-[#e2e8f0] dark:border-slate-700 hover:bg-[#e1f5ff] dark:hover:bg-slate-700 hover:border-[#00a8e8] dark:hover:border-[#38bdf8] hover:text-[#003543] dark:hover:text-white'}`}
    onClick={onClick}
  >
    <span className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-[#2ed573] shadow-[0_0_5px_rgba(46,213,115,0.8)]' : 'bg-[#9a9eab] dark:bg-slate-500'}`} />
    {cameraName}
  </button>
);

const CameraToolbar = ({ cameras, selectedCameraId, onSelect }) => (
  <div className="shrink-0 flex items-center gap-3 bg-white dark:bg-slate-800 p-2 px-4 rounded-xl border border-[#e2e8f0] dark:border-slate-700 shadow-sm overflow-x-auto scrollbar-hide transition-colors duration-300">
    <span className="text-[10px] font-black text-[#9a9eab] dark:text-slate-400 uppercase tracking-widest shrink-0">Sources</span>
    <div className="flex gap-2">
      <CameraButton
        cameraName="Overall Grid"
        isActive={selectedCameraId === 'OVERALL'}
        onClick={() => onSelect('OVERALL')}
        status="active"
      />
      {cameras.map(c => (
        <CameraButton
          key={c.cameraId}
          cameraName={c.name}
          isActive={selectedCameraId === c.cameraId}
          onClick={() => onSelect(c.cameraId)}
          status={c.status.toLowerCase()}
        />
      ))}
    </div>
  </div>
);

export default CameraToolbar;