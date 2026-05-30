import { useState, useEffect, useRef } from 'react';

export const useWebcam = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);

  const [detections, setDetections] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [annotatedFrame, setAnnotatedFrame] = useState(null);
  const [detectionStats, setDetectionStats] = useState({
    fps: 0,
    objectCount: 0,
    lastUpdate: null,
    fallsDetected: 0
  });

  const detectionIntervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const lastTimeRef = useRef(Date.now());

  const startWebcam = async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user'
        },
        audio: false
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      setStream(mediaStream);
      setIsActive(true);
      console.log('Webcam started successfully');
    } catch (err) {
      setError(`Webcam access denied: ${err.message}`);
      setIsActive(false);
      console.error('Webcam error:', err);
    }
  };

  const stopWebcam = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setIsActive(false);
    stopDetection();
    console.log('Webcam stopped');
  };

  const switchCamera = async () => {
    stopWebcam();
    setTimeout(() => startWebcam(), 100);
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) {
      console.warn('Video or canvas ref not available');
      return null;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    if (canvas.width === 0 || canvas.height === 0) {
      console.warn('Video dimensions not ready');
      return null;
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', 0.8);
  };

  const sendFrameToFallDetection = async (frameData) => {
    if (!frameData) {
      console.warn('No frame data to send');
      return;
    }

    try {
      console.log('Sending frame to Fall Detection...');

      const base64Data = frameData.includes(',')
        ? frameData.split(',')[1]
        : frameData;

      const response = await fetch(
        'http://127.0.0.1:5001/api/yolo/detect',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            frame: base64Data
          })
        }
      );

      console.log(`Response status: ${response.status}`);

      if (!response.ok) {
        console.error(
          `Server error: ${response.status} ${response.statusText}`
        );
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        const fallDetections = result.fall_detections || [];
        const totalPersons = result.total_persons || 0;

        setDetections(fallDetections);

        if (result.annotated_frame) {
          setAnnotatedFrame(
            `data:image/jpeg;base64,${result.annotated_frame}`
          );
        }

        setDetectionStats({
          fps: frameCountRef.current,
          objectCount: result.detection_count || 0,
          fallsDetected: fallDetections.length,
          totalPersons: totalPersons,
          lastUpdate: new Date().toLocaleTimeString(),
          modelType: result.model_type || 'Fall Detection Model'
        });

        frameCountRef.current = 0;

        if (fallDetections.length > 0) {
          console.warn('FALL DETECTED!', fallDetections);
        } else {
          console.log(`${totalPersons} person(s) detected - Normal posture`);
        }
      } else {
        console.error('Detection failed:', result.error);
      }
    } catch (err) {
      console.error('Fall Detection error:', err.message);
    }
  };

  const startDetection = (interval = 500) => {
    if (!isActive) {
      const msg = 'Webcam must be active to start detection';
      setError(msg);
      console.warn(msg);
      return;
    }

    console.log('Starting Fall Detection Model...');
    setIsDetecting(true);
    lastTimeRef.current = Date.now();

    detectionIntervalRef.current = setInterval(() => {
      const frameData = captureFrame();
      if (frameData) {
        frameCountRef.current++;
        sendFrameToFallDetection(frameData);
      }
    }, interval);

    console.log(`Fall Detection started with ${interval}ms interval`);
  };

  const stopDetection = () => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    setIsDetecting(false);
    setDetections([]);
    setAnnotatedFrame(null);
    console.log('Fall Detection stopped');
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [stream]);

  return {
    videoRef,
    canvasRef,
    stream,
    error,
    isActive,
    startWebcam,
    stopWebcam,
    switchCamera,

    detections,
    isDetecting,
    annotatedFrame,
    detectionStats,
    startDetection,
    stopDetection
  };
};