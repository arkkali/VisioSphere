import CameraFeed from './CameraFeed';
import { resolveAlertMeta } from './alertMeta';

const StatusBadge = ({ status }) => {
  const meta = resolveAlertMeta(status);
  const isNormal = !status || status === 'NORMAL' || status === 'NO PERSON';
  return (
    <div className={`px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase shadow-lg backdrop-blur-sm border ${isNormal ? 'bg-[#2ed573]/90 text-white border-[#2ed573]' : `${meta.bg}/90 text-white ${meta.border} animate-pulse`}`}>
      {isNormal ? 'NORMAL' : status}
    </div>
  );
};

const CameraGrid = ({ cameras, getCameraStatus }) => (
  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 w-full h-max">
    {cameras.map(c => (
      <div key={c.cameraId} className="bg-black rounded-xl border border-[#e2e8f0] dark:border-slate-700 shadow-md overflow-hidden relative flex flex-col w-full aspect-video">
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
          <div>
            <h2 className="text-white drop-shadow-md font-black text-sm m-0">{c.name}</h2>
            <p className="text-white/70 text-[10px] font-medium m-0 mt-0.5">{c.location}</p>
          </div>
          {c.status === 'Active' && <StatusBadge status={getCameraStatus(c.cameraId)} />}
        </div>
        <div className="flex-1 w-full h-full relative">
          <CameraFeed camera={c} isWebcam={false} isLoading={false} />
        </div>
      </div>
    ))}
  </div>
);

export default CameraGrid;