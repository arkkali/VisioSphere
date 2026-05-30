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

const CameraFeedPanel = ({ camera, getCameraStatus }) => {
  if (!camera) return null;
  return (
    <div className="bg-black rounded-xl border border-[#e2e8f0] dark:border-slate-700 shadow-md overflow-hidden relative flex flex-col w-full aspect-video max-w-5xl mx-auto">
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <h2 className="text-white drop-shadow-md font-black text-lg m-0">{camera.name}</h2>
          <p className="text-white/80 drop-shadow-md text-xs font-medium m-0 flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${camera.status === 'Active' ? 'bg-[#2ed573]' : 'bg-[#9a9eab] dark:bg-slate-500'}`} />
            {camera.location}
          </p>
        </div>
        {camera.status === 'Active' && <StatusBadge status={getCameraStatus(camera.cameraId)} />}
      </div>
      <div className="flex-1 w-full h-full relative">
        <CameraFeed camera={camera} isWebcam={false} isLoading={false} />
      </div>
    </div>
  );
};

export default CameraFeedPanel;