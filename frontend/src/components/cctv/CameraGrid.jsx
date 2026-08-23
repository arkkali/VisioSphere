import CameraFeed from './CameraFeed';

// The status pill that used to sit here was removed: the AI core already
// burns "[<camera>] N person(s) | WORST: <status>" into the top band of the
// stream itself, so the pill repeated it a few pixels away — and the two
// could disagree for a frame or two, since the pill re-renders on socket
// events while the band is part of the image.
const CameraGrid = ({ cameras }) => (
  <div className="grid grid-cols-1 2xl:grid-cols-2 gap-4 w-full h-max">
    {cameras.map(c => (
      <div key={c.cameraId} className="bg-black rounded-xl border border-[#e2e8f0] dark:border-slate-700 shadow-md overflow-hidden relative flex flex-col w-full aspect-video">
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
          <div>
            <h2 className="text-white drop-shadow-md font-black text-sm m-0">{c.name}</h2>
            <p className="text-white/70 text-[10px] font-medium m-0 mt-0.5">{c.location}</p>
          </div>
        </div>
        <div className="flex-1 w-full h-full relative">
          <CameraFeed camera={c} isWebcam={false} isLoading={false} />
        </div>
      </div>
    ))}
  </div>
);

export default CameraGrid;