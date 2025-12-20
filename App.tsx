
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
  const [copied, setCopied] = useState(false);
  
  const [isInCall, setIsInCall] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  useEffect(() => {
    const peerId = generateShortId();
    setMyId(peerId);

    const initPeer = () => {
      const Peer = (window as any).Peer;
      if (!Peer) return;

      const newPeer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun.anyfirewall.com:3478' },
            { urls: 'stun:stun.voip.blackberry.com:3478' }
          ],
          iceCandidatePoolSize: 10,
        }
      });

      newPeer.on('connection', (conn: any) => {
        console.log('Incoming connection:', conn.peer);
        setActiveTargetId(conn.peer);
        setupConnection(conn);
      });

      newPeer.on('call', (call: any) => {
        console.log('Incoming call from:', call.peer);
        callRef.current = call;
        setActiveTargetId(call.peer);
        setIsIncomingCall(true);
        setIsInCall(true);

        call.on('stream', (remote: MediaStream) => {
          console.log('Received remote stream (callee)');
          setRemoteStream(remote);
        });

        call.on('close', endCall);
        call.on('error', endCall);
      });

      newPeer.on('error', (err: any) => {
        console.error('Peer error:', err.type, err);
        if (err.type === 'peer-unavailable' || err.type === 'disconnected') {
          setStatus(ConnectionStatus.ERROR);
        }
      });

      peerRef.current = newPeer;
    };

    initPeer();

    return () => {
      stopHeartbeat();
      peerRef.current?.destroy();
    };
  }, []);

  const startHeartbeat = () => {
    stopHeartbeat();
    heartbeatIntervalRef.current = setInterval(() => {
      if (connRef.current && connRef.current.open) {
        connRef.current.send({ type: 'HEARTBEAT', timestamp: Date.now() });
      }
    }, 15000);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
  };

  const setupConnection = (conn: any) => {
    if (connRef.current) connRef.current.close();
    
    connRef.current = conn;
    
    conn.on('open', () => {
      console.log('Data channel open with:', conn.peer);
      setStatus(ConnectionStatus.CONNECTED);
      startHeartbeat();
    });

    conn.on('data', (data: any) => {
      if (data.type === 'HEARTBEAT') return;
      setMessages((prev) => [...prev, data as ChatMessage]);
    });

    conn.on('close', () => {
      console.log('Connection closed');
      setStatus(ConnectionStatus.DISCONNECTED);
      stopHeartbeat();
    });

    conn.on('error', (err: any) => {
      console.error('Conn error:', err);
      setStatus(ConnectionStatus.ERROR);
    });
  };

  const connectToPeer = (manualId?: string) => {
    const idToConnect = manualId || targetIdInput.trim().toUpperCase();
    if (!idToConnect || !peerRef.current) return;
    
    setActiveTargetId(idToConnect);
    setStatus(ConnectionStatus.CONNECTING);
    
    const conn = peerRef.current.connect(idToConnect, { 
      reliable: true,
      metadata: { initiatorId: myId }
    });
    
    setupConnection(conn);
  };

  const sendMessage = (content: any, type: MessageType = MessageType.TEXT, fileName?: string) => {
    if (!connRef.current || !connRef.current.open) return;

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
      console.error("Send failed:", e);
    }
  };

  const startCall = async () => {
    if (!activeTargetId || !peerRef.current) return;
    try {
      console.log('Requesting media for outgoing call...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
      });
      
      setLocalStream(stream);
      setIsInCall(true);

      const call = peerRef.current.call(activeTargetId, stream);
      callRef.current = call;

      call.on('stream', (remote: MediaStream) => {
        console.log('Received remote stream (caller)');
        setRemoteStream(remote);
      });

      call.on('close', endCall);
      call.on('error', endCall);
    } catch (err) {
      console.error('Call failed:', err);
      alert('Camera access denied or device busy');
      endCall();
    }
  };

  const answerCall = async () => {
    if (!callRef.current) return;
    try {
      console.log('Requesting media for answering call...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
      });
      
      setLocalStream(stream);
      setIsIncomingCall(false);
      callRef.current.answer(stream);
      console.log('Call answered with local stream');
    } catch (err) {
      console.error('Answer failed:', err);
      alert('Could not start camera for call');
      endCall();
    }
  };

  const endCall = () => {
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
    endCall();
  };

  const copyMyId = () => {
    navigator.clipboard.writeText(myId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <div className="w-full max-w-sm space-y-12">
          <div className="text-center space-y-3">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[28px] flex items-center justify-center mx-auto shadow-2xl shadow-blue-200 mb-8 rotate-3 transition-transform hover:rotate-0 duration-500">
              <i className="ph-fill ph-broadcast text-5xl text-white"></i>
            </div>
            <h1 className="text-4xl font-black text-gray-900 tracking-tight">P2P Link</h1>
            <p className="text-gray-400 font-medium text-lg">Fast, private, serverless.</p>
          </div>

          <div className="space-y-8">
            <div className="bg-gray-50 rounded-[24px] p-6 border border-gray-100 relative group">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Your Sharing ID</p>
              <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 shadow-sm transition-all group-hover:shadow-md">
                <span className="text-3xl font-mono font-black text-blue-600 tracking-wider">{myId || '......'}</span>
                <button 
                  onClick={copyMyId}
                  className={`p-3 rounded-xl transition-all flex items-center gap-2 ${
                    copied ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400 hover:text-blue-600 active:scale-90'
                  }`}
                >
                  <i className={`ph-bold ${copied ? 'ph-check' : 'ph-copy'} text-xl`}></i>
                  {copied && <span className="text-xs font-bold uppercase">Copied</span>}
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Connect to Peer</p>
              <div className="relative group">
                <input 
                  type="text"
                  placeholder="FRIEND'S ID"
                  value={targetIdInput}
                  onChange={(e) => setTargetIdInput(e.target.value.toUpperCase())}
                  className="w-full bg-gray-50 border-2 border-transparent rounded-[24px] p-5 pl-14 text-xl font-black placeholder:text-gray-200 focus:bg-white focus:border-blue-500 transition-all uppercase tracking-widest"
                />
                <i className="ph-bold ph-user-focus absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 text-2xl transition-colors group-focus-within:text-blue-500"></i>
              </div>
              <button 
                disabled={!targetIdInput}
                onClick={() => connectToPeer()}
                className="w-full py-5 rounded-[24px] bg-gray-900 text-white font-black text-lg shadow-2xl shadow-gray-200 active:scale-95 hover:bg-black transition-all disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none mt-2"
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
      {(status !== ConnectionStatus.CONNECTED && messages.length === 0) && (
        <div className="absolute inset-0 z-30 bg-white flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
           <div className="relative mb-10">
              <div className="w-32 h-32 bg-blue-50 rounded-full flex items-center justify-center scale-110">
                <span className="text-5xl font-black text-blue-600">{activeTargetId ? activeTargetId[0] : '?'}</span>
              </div>
              <div className="absolute -inset-4 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
           </div>
           <h2 className="text-3xl font-black text-gray-900 mb-3">Connecting</h2>
           <p className="text-gray-400 font-bold text-lg mb-12">Negotiating P2P channel with <span className="text-blue-600">{activeTargetId}</span>...</p>
           <button 
             onClick={handleLogout}
             className="px-12 py-4 rounded-2xl border-2 border-gray-100 text-gray-400 font-black uppercase tracking-widest hover:bg-red-50 hover:text-red-500 transition-all"
           >
             Cancel Link
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
