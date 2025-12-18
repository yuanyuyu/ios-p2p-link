
import React, { useEffect, useRef } from 'react';

interface VideoCallOverlayProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  onEndCall: () => void;
  isIncoming?: boolean;
  onAnswer?: () => void;
  remotePeerId?: string;
}

const VideoCallOverlay: React.FC<VideoCallOverlayProps> = ({ 
  localStream, 
  remoteStream, 
  onEndCall, 
  isIncoming, 
  onAnswer,
  remotePeerId
}) => {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // 绑定本地流
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('Binding local stream to video element');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.warn('Local video auto-play failed:', e));
    }
  }, [localStream]);

  // 绑定远程流
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('Binding remote stream to video element');
      remoteVideoRef.current.srcObject = remoteStream;
      // 尝试自动播放，WebRTC 远程流通常需要显式调用 play()
      remoteVideoRef.current.play().catch(e => {
        console.error('Remote video play failed:', e);
      });
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Remote Video (Full Screen) */}
      <div className="absolute inset-0 w-full h-full bg-gray-900">
        {remoteStream ? (
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/50">
            <div className="flex flex-col items-center gap-6">
              <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center animate-pulse">
                <i className="ph-fill ph-user text-5xl"></i>
              </div>
              <div className="text-center px-6">
                <h3 className="text-xl font-bold text-white mb-1">Peer {remotePeerId || '...'}</h3>
                <p className="text-sm text-white/60">
                  {isIncoming ? "Calling you..." : "Waiting for connection..."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Local Video (PIP) */}
      <div className={`absolute transition-all duration-500 ease-in-out ${
        isIncoming && !remoteStream 
          ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-72 opacity-50 blur-sm scale-90" 
          : "top-4 right-4 w-32 h-48"
        } bg-gray-800 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 z-10`}>
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
        />
        {isIncoming && !remoteStream && (
           <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
              <span className="text-[10px] text-white font-bold uppercase tracking-widest">Self View</span>
           </div>
        )}
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-0 w-full p-10 bg-gradient-to-t from-black/90 via-black/40 to-transparent flex flex-col items-center gap-8">
        {isIncoming && !remoteStream ? (
          <div className="flex gap-12 items-center">
            <button 
              onClick={onEndCall}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-3xl"></i>
            </button>
            <button 
              onClick={onAnswer}
              className="w-20 h-20 rounded-full bg-green-500 text-white flex items-center justify-center shadow-2xl shadow-green-500/30 active:scale-90 transition transform hover:scale-110 animate-bounce"
            >
              <i className="ph-fill ph-phone text-4xl"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-10">
            <button className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur-md">
                <i className="ph-bold ph-microphone-slash text-xl"></i>
            </button>
            <button 
              onClick={onEndCall}
              className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/40 active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-4xl"></i>
            </button>
            <button className="w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center backdrop-blur-md">
                <i className="ph-bold ph-video-camera-slash text-xl"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCallOverlay;
