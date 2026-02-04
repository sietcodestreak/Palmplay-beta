import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, CameraOff, Sparkles } from 'lucide-react';

const GestureController = ({ onGestureDetected }) => {
    const [isActive, setIsActive] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [lastGesture, setLastGesture] = useState(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const requestRef = useRef(null);
    const lastProcessTime = useRef(0);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsStreaming(true);
            }
        } catch (err) {
            console.error("Camera access error:", err);
            setIsActive(false);
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsStreaming(false);
    };

    const detectGesture = useCallback(async () => {
        if (!isActive || !isStreaming || !videoRef.current || !canvasRef.current) return;

        const now = Date.now();
        // Limit processing to ~5 FPS to avoid overloading backend/network
        if (now - lastProcessTime.current < 200) {
            requestRef.current = requestAnimationFrame(detectGesture);
            return;
        }

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');

        // Draw current frame to hidden canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to blob and send
        canvas.toBlob(async (blob) => {
            if (!blob) return;

            const formData = new FormData();
            formData.append('file', blob, 'frame.jpg');

            try {
                const response = await fetch('/api/detect-gesture', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();

                if (result.gesture) {
                    setLastGesture(result);
                    if (onGestureDetected) onGestureDetected(result);

                    // Show gesture for 1 second
                    setTimeout(() => setLastGesture(null), 1000);
                }
            } catch (error) {
                console.error("Gesture API error:", error);
            }

            lastProcessTime.current = Date.now();
            if (isActive) {
                requestRef.current = requestAnimationFrame(detectGesture);
            }
        }, 'image/jpeg', 0.6); // Medium quality for speed
    }, [isActive, isStreaming, onGestureDetected]);

    useEffect(() => {
        if (isActive) {
            startCamera();
        } else {
            stopCamera();
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
            }
        }
        return () => stopCamera();
    }, [isActive]);

    useEffect(() => {
        if (isStreaming && isActive) {
            requestRef.current = requestAnimationFrame(detectGesture);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isStreaming, isActive, detectGesture]);

    const getGestureIcon = (gesture) => {
        switch (gesture) {
            case 'toggle': return '✊';
            case 'shuffle': return '🔀';
            case 'repeat': return '🔁';
            case 'volume': return '🔊';
            default: return '✨';
        }
    };

    return (
        <div className="fixed top-6 right-6 z-[60] flex flex-col items-end gap-3">
            {/* Gesture Feedback Toast */}
            {lastGesture && (
                <div className="bg-crimson text-white px-6 py-3 rounded-2xl shadow-[0_10px_40px_rgba(225,29,72,0.4)] flex items-center gap-3 animate-bounce border border-white/20 backdrop-blur-md">
                    <span className="text-2xl">{getGestureIcon(lastGesture.gesture)}</span>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Gesture Active</span>
                        <span className="font-bold text-sm">
                            {lastGesture.gesture === 'volume' ? `Volume: ${lastGesture.value}%` :
                                lastGesture.gesture === 'toggle' ? 'Play / Pause' :
                                    lastGesture.gesture === 'shuffle' ? `Shuffle: ${lastGesture.value ? 'ON' : 'OFF'}` :
                                        lastGesture.gesture === 'repeat' ? `Repeat: ${lastGesture.value ? 'ON' : 'OFF'}` : 'Detected'}
                        </span>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-3">
                {/* Camera Toggle Button */}
                <button
                    onClick={() => setIsActive(!isActive)}
                    className={`
                        group flex items-center gap-3 px-5 py-3 rounded-2xl transition-all duration-500 border backdrop-blur-xl relative overflow-hidden
                        ${isActive ?
                            'bg-crimson/20 border-crimson/50 text-crimson shadow-[0_0_30px_rgba(225,29,72,0.2)]' :
                            'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white'
                        }
                    `}
                >
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                    {isActive ? <Camera size={20} /> : <CameraOff size={20} />}
                    <span className="text-xs font-black uppercase tracking-widest">
                        {isActive ? 'Gestures ON' : 'Gestures OFF'}
                    </span>
                    {isActive && (
                        <div className="flex gap-1 items-center ml-1">
                            <div className="w-1.5 h-1.5 bg-crimson rounded-full animate-pulse" />
                        </div>
                    )}
                </button>
            </div>

            {/* Hidden Video Feed & Canvas */}
            <div className={`mt-2 rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-all duration-500 origin-top-right ${isActive ? 'scale-100 opacity-100 h-32 w-48' : 'scale-0 opacity-0 h-0 w-0'}`}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover grayscale brightness-125 contrast-125 scale-x-[-1]"
                />
                <div className="absolute inset-0 border-2 border-crimson/20 pointer-events-none" />
                <div className="absolute bottom-1 right-2 text-[8px] font-bold text-white/40 uppercase tracking-tighter">Live Feed</div>
            </div>

            <canvas ref={canvasRef} width="320" height="240" className="hidden" />
        </div>
    );
};

export default GestureController;
