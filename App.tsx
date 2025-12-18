
import React, { useState, useEffect, useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import VideoCallOverlay from './components/VideoCallOverlay';
import { ChatMessage, ConnectionStatus, MessageType } from './types';
import { v4 as uuidv4 } from 'uuid';

const generateShortId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const App: React.FC = () => {
  const [myId, setMyId] = useState<string>('');
  const [targetIdInput, setTargetIdInput] = useState<string>('');
  const [activeTargetId, setActiveTargetId] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  const [isInCall, setIsInCall] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const retryIntervalRef = useRef<any>(null);
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const callRef = useRef<any>(null);

  useEffect(() => {
    const peerId = generateShortId();
    setMyId(peerId);

    const Peer = (window as any).Peer;
    if (!Peer) return;

    const newPeer = new Peer(peerId, {
      debug: 2, // 增加调试级别以便观察连接过程
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    newPeer.on('open', (id: string) => {
      console.log('My Peer ID:', id);
    });

    newPeer.on('connection', (conn: any) => {
      setActiveTargetId(conn.peer);
      handleConnection(conn);
    });

    // 关键：处理呼入通话
    newPeer.on('call', (call: any) => {
      console.log('Incoming call from:', call.peer);
      callRef.current = call;
      setActiveTargetId(call.peer);
      setIsIncomingCall(true);
      setIsInCall(true);

      // 在呼入时就绑定流监听，确保对方视频流一到就能捕获
      call.on('stream', (remote: MediaStream) => {
        console.log('Callee received remote stream');
        setRemoteStream(remote);
      });

      call.on('close', endCall);
      call.on('error', (err: any) => {
        console.error('Call error:', err);
        endCall();
      });
    });

    newPeer.on('error', (err: any) => {
      console.error('Peer error:', err);
      if (err.type === 'peer-unavailable') {
        setStatus(ConnectionStatus.DISCONNECTED);
      }
    });

    peerRef.current = newPeer;

    return () => {
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
      peerRef.current?.destroy();
    };
  }, []);

  const handleConnection = (conn: any) => {
    if (connRef.current && connRef.current.open) {
      connRef.current.close();
    }

    connRef.current = conn;
    setStatus(ConnectionStatus.CONNECTED);

    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }

    conn.on('data', (data: ChatMessage) => {
      setMessages((prev) => [...prev, data]);
    });

    conn.on('close', () => {
      setStatus(ConnectionStatus.DISCONNECTED);
      endCall();
    });
  };

  const connectToPeer = (manualId?: string) => {
    const idToConnect = manualId || targetIdInput.trim().toUpperCase();
    if (!idToConnect || !peerRef.current) return;
    
    setActiveTargetId(idToConnect);
    setStatus(ConnectionStatus.CONNECTING);
    
    const attempt = () => {
      if (!peerRef.current || peerRef.current.destroyed) return;
      
      console.log(`Attempting data connection to ${idToConnect}...`);
      const conn = peerRef.current.connect(idToConnect, {
        reliable: true,
        serialization: 'json'
      });
      
      conn.on('open', () => handleConnection(conn));
      conn.on('error', (err: any) => console.warn("Connection attempt failed", err));
    };

    attempt();

    if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    retryIntervalRef.current = setInterval(() => {
      if (status === ConnectionStatus.CONNECTED) {
        clearInterval(retryIntervalRef.current);
        return;
      }
      attempt();
    }, 5000);
  };

  const sendMessage = (content: string, type: MessageType = MessageType.TEXT, fileName?: string) => {
    if (!connRef.current || !myId) return;

    const msg: ChatMessage = {
      id: uuidv4(),
      senderId: myId, 
      type,
      content,
      timestamp: Date.now(),
      fileName
    };

    try {
      connRef.current.send(msg);
      setMessages((prev) => [...prev, msg]);
    } catch (e) {
      console.error("Send failed", e);
    }
  };

  const startCall = async () => {
    if (!activeTargetId) return;
    try {
      console.log('Starting call to:', activeTargetId);
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsInCall(true);

      const call = peerRef.current.call(activeTargetId, stream);
      callRef.current = call;

      call.on('stream', (remote: MediaStream) => {
        console.log('Caller received remote stream from answer');
        setRemoteStream(remote);
      });

      call.on('close', endCall);
      call.on('error', endCall);
    } catch (err) {
      console.error('Media access error:', err);
      alert('Cannot access camera/microphone');
    }
  };

  const answerCall = async () => {
    if (!callRef.current) return;
    try {
      console.log('Answering call...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setIsIncomingCall(false);
      // 必须先建立本地流再 answer
      callRef.current.answer(stream);
    } catch (err) {
      console.error('Error answering call:', err);
      alert('Could not start camera for answer');
      endCall();
    }
  };

  const endCall = () => {
    console.log('Ending call and cleaning up streams');
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    setLocalStream(null);
    setRemoteStream(null);
    setIsInCall(false);
    setIsIncomingCall(false);
  };

  const handleLogout = () => {
    if(connRef.current) connRef.current.close();
    setMessages([]);
    setActiveTargetId('');
    setStatus(ConnectionStatus.DISCONNECTED);
  };

  const copyMyId = () => {
    navigator.clipboard.writeText(myId);
  };

  if (isInCall) {
    return (
      <VideoCallOverlay 
        localStream={localStream}
        remoteStream={remoteStream}
        onEndCall={endCall}
        isIncoming={isIncomingCall}
        onAnswer={answerCall}
        remotePeerId={activeTargetId}
      />
    );
  }

  if (status === ConnectionStatus.DISCONNECTED && messages.length === 0 && !activeTargetId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-white safe-top safe-bottom">
        <div className="w-full max-w-sm space-y-10">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-blue-600 rounded-[22px] flex items-center justify-center mx-auto shadow-2xl shadow-blue-200 mb-6 rotate-3">
              <i className="ph-fill ph-broadcast text-4xl text-white"></i>
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">P2P Link</h1>
            <p className="text-gray-500 font-medium">Fast, private, serverless.</p>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Your Sharing ID</p>
              <div className="flex items-center justify-between bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                <span className="text-2xl font-mono font-bold text-blue-600 tracking-widest">{myId || '......'}</span>
                <button 
                  onClick={copyMyId}
                  className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 active:text-blue-500 transition-colors"
                >
                  <i className="ph-bold ph-copy text-xl"></i>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest px-1">Connect to Peer</p>
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Enter Friend's ID"
                  value={targetIdInput}
                  onChange={(e) => setTargetIdInput(e.target.value.toUpperCase())}
                  className="w-full bg-gray-50 border-none rounded-2xl p-4 pl-12 text-lg font-bold placeholder:text-gray-300 focus:ring-2 focus:ring-blue-500 transition-all uppercase"
                />
                <i className="ph-bold ph-user-focus absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 text-xl"></i>
              </div>
              <button 
                disabled={!targetIdInput}
                onClick={() => connectToPeer()}
                className="w-full py-4 rounded-2xl bg-black text-white font-bold text-lg shadow-xl shadow-gray-200 active:scale-95 transition-all disabled:bg-gray-200 disabled:shadow-none"
              >
                Join Channel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full relative bg-white">
      {status !== ConnectionStatus.CONNECTED && messages.length === 0 && (
        <div className="absolute inset-0 z-10 bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
           <div className="relative mb-8">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-4xl font-black text-blue-600">{activeTargetId ? activeTargetId[0] : '?'}</span>
              </div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           </div>
           <h2 className="text-2xl font-black text-gray-900 mb-2">Connecting</h2>
           <p className="text-gray-400 font-medium mb-10">Linking with peer {activeTargetId}...</p>
           <button 
             onClick={handleLogout}
             className="px-8 py-3 rounded-full border-2 border-gray-100 text-gray-500 font-bold hover:bg-gray-50 transition"
           >
             Cancel Attempt
           </button>
        </div>
      )}

      <ChatInterface
        messages={messages}
        myId={myId}
        onSendMessage={sendMessage}
        onStartCall={startCall}
        remotePeerId={activeTargetId}
        onDisconnect={handleLogout}
        status={status}
        onReconnect={() => connectToPeer(activeTargetId)}
      />
    </div>
  );
};

export default App;
