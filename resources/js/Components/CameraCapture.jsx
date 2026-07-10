import { useState, useRef, useEffect, useCallback } from 'react';

export default function CameraCapture({ mode = 'photo', maxPhotos = 5, maxVideoDuration = 60, existingFiles = [], onCapture, onRemove }) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const timerRef = useRef(null);
    const chunksRef = useRef([]);

    const [stream, setStream] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [facingMode, setFacingMode] = useState('environment');
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const [recording, setRecording] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [recordedPreviewUrl, setRecordedPreviewUrl] = useState(null);

    // Check for multiple cameras
    useEffect(() => {
        navigator.mediaDevices?.enumerateDevices?.().then(devices => {
            const videoInputs = devices.filter(d => d.kind === 'videoinput');
            setHasMultipleCameras(videoInputs.length > 1);
        }).catch(() => {});
    }, []);

    // Cleanup stream on unmount
    useEffect(() => {
        return () => {
            stopCamera();
        };
    }, []);

    // Cleanup preview URL
    useEffect(() => {
        return () => {
            if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
        };
    }, [recordedPreviewUrl]);

    const stopCamera = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            try { mediaRecorderRef.current.stop(); } catch {}
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        setStream(null);
        setCameraActive(false);
        setRecording(false);
        setElapsedSeconds(0);
    }, [stream]);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: mode === 'video',
            });
            setStream(mediaStream);
            setCameraActive(true);
            setPermissionDenied(false);
            // Attach stream to video element after state update
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                }
            }, 0);
        } catch (err) {
            if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
                setPermissionDenied(true);
            }
            console.error('Camera access error:', err);
        }
    };

    const flipCamera = async () => {
        stopCamera();
        const newFacing = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(newFacing);
        // Restart with new facing mode after a tick
        setTimeout(async () => {
            try {
                const mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: newFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: mode === 'video',
                });
                setStream(mediaStream);
                setCameraActive(true);
                setTimeout(() => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = mediaStream;
                    }
                }, 0);
            } catch (err) {
                console.error('Camera flip error:', err);
            }
        }, 100);
    };

    const capturePhoto = () => {
        if (!videoRef.current || existingFiles.length >= maxPhotos) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            if (blob) {
                const file = new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
                onCapture(file);
            }
        }, 'image/jpeg', 0.85);
    };

    const startRecording = () => {
        if (!stream) return;

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
                ? 'video/webm'
                : 'video/mp4';

        chunksRef.current = [];
        const recorder = new MediaRecorder(stream, { mimeType });
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            const ext = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], `video-${Date.now()}.${ext}`, { type: recorder.mimeType });
            onCapture(file);

            // Create preview URL
            if (recordedPreviewUrl) URL.revokeObjectURL(recordedPreviewUrl);
            setRecordedPreviewUrl(URL.createObjectURL(blob));

            clearInterval(timerRef.current);
            timerRef.current = null;
            setRecording(false);
            setElapsedSeconds(0);
        };

        recorder.start(1000); // collect data every second
        setRecording(true);
        setElapsedSeconds(0);

        timerRef.current = setInterval(() => {
            setElapsedSeconds(prev => {
                if (prev + 1 >= maxVideoDuration) {
                    recorder.stop();
                    return prev + 1;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    const formatTime = (seconds) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const formatFileSize = (bytes) => {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    };

    // Photo thumbnails
    const photoPreviewUrls = useRef({});
    const getPhotoPreviewUrl = (file, index) => {
        const key = `${file.name}-${file.size}-${index}`;
        if (!photoPreviewUrls.current[key]) {
            photoPreviewUrls.current[key] = URL.createObjectURL(file);
        }
        return photoPreviewUrls.current[key];
    };

    // Cleanup photo preview URLs when files change
    useEffect(() => {
        return () => {
            Object.values(photoPreviewUrls.current).forEach(url => URL.revokeObjectURL(url));
            photoPreviewUrls.current = {};
        };
    }, []);

    // Permission denied state
    if (permissionDenied) {
        return (
            <div className="border-2 border-dashed border-red-300 dark:border-red-700 rounded-lg p-6 text-center">
                <svg className="mx-auto h-10 w-10 text-red-400 dark:text-red-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">Camera access denied</p>
                <p className="text-xs text-red-500 dark:text-red-500 mt-1">Please enable camera permissions in your browser settings.</p>
                <button
                    type="button"
                    onClick={() => { setPermissionDenied(false); startCamera(); }}
                    className="mt-3 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    // Camera not active — show open button
    if (!cameraActive) {
        return (
            <div>
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center">
                    <svg className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        {mode === 'photo' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
                        )}
                    </svg>
                    <button
                        type="button"
                        onClick={startCamera}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                    >
                        {mode === 'photo' ? 'Open Camera' : 'Open Camera'}
                    </button>
                    <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                        {mode === 'photo'
                            ? `Capture up to ${maxPhotos} photos directly from your camera.`
                            : `Record a video up to ${maxVideoDuration} seconds.`
                        }
                    </p>
                </div>

                {/* Show existing captured files */}
                {mode === 'photo' && existingFiles.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{existingFiles.length}/{maxPhotos} photos captured</p>
                        <div className="grid grid-cols-5 gap-2">
                            {existingFiles.map((file, i) => (
                                <div key={i} className="relative group">
                                    <img
                                        src={getPhotoPreviewUrl(file, i)}
                                        alt={`Photo ${i + 1}`}
                                        className="w-full aspect-square object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onRemove(i)}
                                        className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        x
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {mode === 'video' && existingFiles.length > 0 && (
                    <div className="mt-3">
                        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-1.5">
                            <span className="truncate">{existingFiles[0].name} ({formatFileSize(existingFiles[0].size)})</span>
                            <button
                                type="button"
                                onClick={() => onRemove(0)}
                                className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                            >
                                x
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Camera active — show preview and controls
    return (
        <div>
            <div className="relative rounded-lg overflow-hidden bg-black">
                {/* Live camera preview */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={mode === 'photo'}
                    className="w-full"
                    style={{ maxHeight: '400px', objectFit: 'contain' }}
                />

                {/* Recording indicator */}
                {recording && (
                    <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 rounded-full px-3 py-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-white text-sm font-mono">{formatTime(elapsedSeconds)}</span>
                        <span className="text-white/60 text-xs">/ {formatTime(maxVideoDuration)}</span>
                    </div>
                )}

                {/* Video time progress bar */}
                {mode === 'video' && recording && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30">
                        <div
                            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
                            style={{ width: `${(elapsedSeconds / maxVideoDuration) * 100}%` }}
                        />
                    </div>
                )}

                {/* Top right controls */}
                <div className="absolute top-3 right-3 flex gap-2">
                    {hasMultipleCameras && !recording && (
                        <button
                            type="button"
                            onClick={flipCamera}
                            className="h-9 w-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
                            title="Flip camera"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                        </button>
                    )}
                    {!recording && (
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="h-9 w-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
                            title="Close camera"
                        >
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Controls below preview */}
            <div className="mt-3 flex items-center justify-center gap-4">
                {mode === 'photo' ? (
                    <>
                        <button
                            type="button"
                            onClick={capturePhoto}
                            disabled={existingFiles.length >= maxPhotos}
                            className="h-14 w-14 rounded-full border-4 border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-200 hover:bg-gray-100 dark:hover:bg-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                            title="Capture photo"
                        >
                            <span className="h-10 w-10 rounded-full bg-gray-100 dark:bg-gray-300 border-2 border-gray-300 dark:border-gray-400" />
                        </button>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            {existingFiles.length}/{maxPhotos}
                        </span>
                    </>
                ) : (
                    <>
                        {!recording ? (
                            <button
                                type="button"
                                onClick={startRecording}
                                disabled={existingFiles.length > 0}
                                className="h-14 w-14 rounded-full border-4 border-red-400 dark:border-red-500 bg-white dark:bg-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center"
                                title="Start recording"
                            >
                                <span className="h-8 w-8 rounded-full bg-red-500" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={stopRecording}
                                className="h-14 w-14 rounded-full border-4 border-red-400 dark:border-red-500 bg-white dark:bg-gray-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center justify-center"
                                title="Stop recording"
                            >
                                <span className="h-7 w-7 rounded bg-red-500" />
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Photo thumbnails strip */}
            {mode === 'photo' && existingFiles.length > 0 && (
                <div className="mt-3 grid grid-cols-5 gap-2">
                    {existingFiles.map((file, i) => (
                        <div key={i} className="relative group">
                            <img
                                src={getPhotoPreviewUrl(file, i)}
                                alt={`Photo ${i + 1}`}
                                className="w-full aspect-square object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                            />
                            <button
                                type="button"
                                onClick={() => onRemove(i)}
                                className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                x
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Video preview after recording */}
            {mode === 'video' && existingFiles.length > 0 && !recording && (
                <div className="mt-3">
                    <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded px-3 py-1.5">
                        <span className="truncate">{existingFiles[0].name} ({formatFileSize(existingFiles[0].size)})</span>
                        <button
                            type="button"
                            onClick={() => onRemove(0)}
                            className="text-gray-400 hover:text-red-500 ml-2 shrink-0"
                        >
                            x
                        </button>
                    </div>
                </div>
            )}

            {/* Hidden canvas for photo capture */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
}
