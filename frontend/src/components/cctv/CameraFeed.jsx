const CameraFeed = ({
  camera,
  videoRef,
  canvasRef,
  isWebcam = false,
  isLoading = false
}) => {
  return (
    <div className="w-full h-full relative flex items-center justify-center bg-black">
      {camera?.type === 'stream' ? (
        <img
          src={camera.url}
          alt={camera.name}
          className="w-full h-full object-cover"
          key={camera.url}
        />
      ) : isWebcam ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <canvas
            ref={canvasRef}
            className="hidden"
            width={640}
            height={480}
          />
        </>
      ) : camera?.url ? (
        <img
          src={camera.url}
          alt={camera.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-slate-500">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-12 h-12 mb-3 opacity-20"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          <p className="text-xs font-black uppercase tracking-widest opacity-40">
            {isLoading ? 'Establishing Link...' : 'No Signal'}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-[10px] text-sky-500 font-black uppercase tracking-tighter">Syncing Feed</span>
          </div>
        </div>
      )}
      
      <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
    </div>
  );
};

export default CameraFeed;