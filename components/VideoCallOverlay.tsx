
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

  // 本地流绑定
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(console.error);
    }
  }, [localStream]);

  // 远程流绑定 - 核心修复点
  useEffect(() => {
    const remoteVideo = remoteVideoRef.current;
    if (remoteVideo && remoteStream) {
      console.log('VideoCallOverlay: Mounting remote stream');
      remoteVideo.srcObject = remoteStream;
      
      const handlePlay = () => {
        remoteVideo.play().catch((err) => {
          console.warn('Auto-play failed, requiring user interaction or mute', err);
          // 如果被拦截，尝试静音播放
          remoteVideo.muted = true;
          remoteVideo.play().catch(console.error);
        });
      };

      if (remoteVideo.readyState >= 3) { // HAVE_FUTURE_DATA
        handlePlay();
      } else {
        remoteVideo.addEventListener('loadedmetadata', handlePlay, { once: true });
      }
    }
  }, [remoteStream]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden animate-in fade-in duration-300">
      {/* Remote Video (Full Screen) */}
      <div className="absolute inset-0 w-full h-full bg-gray-900">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={`w-full h-full object-cover transition-opacity duration-1000 ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
        />
        
        {!remoteStream && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white/50 bg-gray-950">
            <div className="w-32 h-32 bg-white/5 rounded-full flex items-center justify-center border border-white/10 relative mb-8">
              <i className="ph-fill ph-user text-6xl"></i>
              <div className="absolute -inset-2 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Peer {remotePeerId}</h3>
            <p className="text-xs font-black text-blue-400 uppercase tracking-[0.3em] animate-pulse">
              {isIncoming ? "Incoming Call" : "Calling Peer..."}
            </p>
          </div>
        )}
      </div>

      {/* Local Video (PIP) */}
      <div className={`absolute transition-all duration-1000 cubic-bezier(0.16, 1, 0.3, 1) ${
        isIncoming && !remoteStream 
          ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] w-64 h-96 scale-110 shadow-2xl" 
          : "top-8 right-8 w-32 h-48 border-2 border-white/20"
        } bg-gray-800 rounded-[32px] overflow-hidden z-10`}>
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {isIncoming && !remoteStream && (
           <div className="absolute inset-x-0 bottom-4 text-center">
              <span className="text-[10px] text-white/60 font-black uppercase tracking-widest">Your Camera</span>
           </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-16 w-full flex flex-col items-center gap-12 px-8">
        {isIncoming && !remoteStream ? (
          <div className="flex gap-16 items-center animate-in slide-in-from-bottom duration-700">
            <button 
              onClick={onEndCall}
              className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-4xl"></i>
            </button>
            <button 
              onClick={onAnswer}
              className="w-24 h-24 rounded-full bg-green-500 text-white flex items-center justify-center shadow-2xl active:scale-90 transition transform hover:scale-110 animate-bounce"
            >
              <i className="ph-fill ph-phone text-4xl"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-12">
            <button className="w-16 h-16 rounded-full bg-white/10 text-white/80 flex items-center justify-center backdrop-blur-xl border border-white/20 hover:bg-white/20 transition active:scale-90">
                <i className="ph-bold ph-microphone-slash text-2xl"></i>
            </button>
            <button 
              onClick={onEndCall}
              className="w-22 h-22 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-4xl"></i>
            </button>
            <button className="w-16 h-16 rounded-full bg-white/10 text-white/80 flex items-center justify-center backdrop-blur-xl border border-white/20 hover:bg-white/20 transition active:scale-90">
                <i className="ph-bold ph-video-camera-slash text-2xl"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCallOverlay;
