
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

  // 绑定本地流逻辑
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('VideoOverlay: Binding local stream');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.onloadedmetadata = () => {
        localVideoRef.current?.play().catch(err => console.warn('Local play error:', err));
      };
    }
  }, [localStream]);

  // 绑定远程流逻辑 - 增强挂载点检查
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('VideoOverlay: Binding remote stream from Peer', remotePeerId);
      remoteVideoRef.current.srcObject = remoteStream;
      
      // 关键：监听 metadata 加载完成再调用 play
      remoteVideoRef.current.onloadedmetadata = () => {
        console.log('VideoOverlay: Remote metadata loaded, starting playback');
        remoteVideoRef.current?.play().catch(err => {
          console.error('Remote video playback failed. This might be due to browser autopaly restrictions:', err);
        });
      };
    } else if (remoteStream) {
        console.warn('VideoOverlay: Remote stream exists but ref is null');
    }
  }, [remoteStream, remotePeerId]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden">
      {/* Remote Video (Full Screen) */}
      <div className="absolute inset-0 w-full h-full bg-gray-900">
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className={`w-full h-full object-cover transition-opacity duration-700 ${remoteStream ? 'opacity-100' : 'opacity-0'}`}
        />
        
        {!remoteStream && (
          <div className="absolute inset-0 flex items-center justify-center text-white/50 bg-gray-900">
            <div className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
              <div className="w-28 h-28 bg-white/5 rounded-full flex items-center justify-center border border-white/10 relative">
                <i className="ph-fill ph-user text-6xl"></i>
                <div className="absolute inset-0 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <div className="text-center px-6">
                <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Peer {remotePeerId || '...'}</h3>
                <p className="text-sm font-bold text-blue-400 uppercase tracking-widest animate-pulse">
                  {isIncoming ? "Incoming Call" : "Connecting Media..."}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Local Video (PIP) */}
      <div className={`absolute transition-all duration-700 cubic-bezier(0.19, 1, 0.22, 1) ${
        isIncoming && !remoteStream 
          ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-56 h-80 opacity-60 blur-sm scale-110" 
          : "top-6 right-6 w-32 h-48"
        } bg-gray-800 rounded-[28px] overflow-hidden shadow-2xl border-2 border-white/20 z-10`}>
        <video 
          ref={localVideoRef} 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover mirror"
        />
        <style>{`.mirror { transform: scaleX(-1); }`}</style>
        {isIncoming && !remoteStream && (
           <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
              <span className="text-[10px] text-white font-black uppercase tracking-[0.3em]">Self View</span>
           </div>
        )}
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-0 w-full p-12 bg-gradient-to-t from-black/95 via-black/40 to-transparent flex flex-col items-center gap-10">
        {isIncoming && !remoteStream ? (
          <div className="flex gap-14 items-center animate-in slide-in-from-bottom duration-700">
            <button 
              onClick={onEndCall}
              className="w-16 h-16 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/20 active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-3xl"></i>
            </button>
            <button 
              onClick={onAnswer}
              className="w-22 h-22 rounded-full bg-green-500 text-white flex items-center justify-center shadow-2xl shadow-green-500/40 active:scale-90 transition transform hover:scale-110 animate-bounce"
            >
              <i className="ph-fill ph-phone text-4xl"></i>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-10 animate-in fade-in duration-500 delay-300">
            <button className="w-14 h-14 rounded-full bg-white/5 text-white/60 flex items-center justify-center backdrop-blur-xl border border-white/10 hover:bg-white/10 transition">
                <i className="ph-bold ph-microphone-slash text-2xl"></i>
            </button>
            <button 
              onClick={onEndCall}
              className="w-20 h-20 rounded-full bg-red-500 text-white flex items-center justify-center shadow-2xl shadow-red-500/40 active:scale-90 transition transform hover:scale-105"
            >
              <i className="ph-fill ph-phone-slash text-4xl"></i>
            </button>
            <button className="w-14 h-14 rounded-full bg-white/5 text-white/60 flex items-center justify-center backdrop-blur-xl border border-white/10 hover:bg-white/10 transition">
                <i className="ph-bold ph-video-camera-slash text-2xl"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoCallOverlay;
