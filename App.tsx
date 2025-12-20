
import React, { useState, useEffect, useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import VideoCallOverlay from './components/VideoCallOverlay';
import { ChatMessage, ConnectionStatus, MessageType, LogEntry } from './types';
import { v4 as uuidv4 } from 'uuid';

const CHUNK_SIZE = 16384;

const App: React.FC = () => {
  const [myId, setMyId] = useState<string>('');
  const [targetIdInput, setTargetIdInput] = useState<string>('');
  const [activeTargetId, setActiveTargetId] = useState<string>('');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transferProgress, setTransferProgress] = useState<Record<string, number>>({});
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);
  
  const [isInCall, setIsInCall] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const incomingChunks = useRef<Record<string, { chunks: any[], total: number }>>({});
  const connectionTimeoutRef = useRef<any>(null);

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    const newLog: LogEntry = {
      id: uuidv4(),
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      level
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
  };

  useEffect(() => {
    const peerId = Math.random().toString(36).substring(2, 8).toUpperCase();
    setMyId(peerId);

    const Peer = (window as any).Peer;
    if (!Peer) {
      addLog("PeerJS library missing!", "error");
      return;
    }

    addLog("Initializing Peer system...", "info");
    const newPeer = new Peer(peerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.anyfirewall.com:3478' },
          { urls: 'stun:stun.voip.blackberry.com:3478' }
        ],
        iceCandidatePoolSize: 10,
      }
    });

    newPeer.on('open', (id: string) => {
      addLog(`Signaling server connected. My ID: ${id}`, "success");
    });

    newPeer.on('connection', (conn: any) => {
      addLog(`Incoming link request from ${conn.peer}`, "info");
      setActiveTargetId(conn.peer);
      setupDataConnection(conn);
    });

    newPeer.on('call', (call: any) => {
      addLog(`Incoming call verified from ${call.peer}`, "success");
      callRef.current = call;
      call.on('stream', (remote: MediaStream) => {
        addLog("Remote media stream received", "success");
        setRemoteStream(remote);
      });
      call.on('close', endCall);
      call.on('error', (err: any) => {
        addLog(`Call error: ${err.type}`, "error");
        endCall();
      });
    });

    newPeer.on('error', (err: any) => {
      addLog(`Peer system error: ${err.type}`, "error");
      if (err.type === 'peer-unavailable') {
        addLog("Target Peer not found. Verify ID.", "warn");
        setStatus(ConnectionStatus.ERROR);
      }
      if (err.type === 'network') {
        addLog("Network error. Check your connection.", "error");
      }
    });

    peerRef.current = newPeer;
    return () => {
      newPeer.destroy();
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    };
  }, []);

  const setupDataConnection = (conn: any) => {
    if (connRef.current) connRef.current.close();
    connRef.current = conn;
    
    addLog(`Negotiating data channel with ${conn.peer}...`, "info");

    conn.on('open', () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      addLog("P2P Data Channel established successfully", "success");
      setStatus(ConnectionStatus.CONNECTED);
    });

    conn.on('close', () => {
      addLog("P2P Link disconnected", "warn");
      setStatus(ConnectionStatus.DISCONNECTED);
    });

    conn.on('error', (err: any) => {
      addLog(`Data channel error: ${err.type || err}`, "error");
      setStatus(ConnectionStatus.ERROR);
    });
    
    conn.on('data', (data: any) => {
      // Handle non-chat message objects (like heartbeats or raw PeerJS events)
      if (!data || typeof data !== 'object') return;

      if (data.type === MessageType.CHUNK) {
        handleIncomingChunk(data);
      } else if (data.type === MessageType.CALL_REQUEST) {
        addLog("Call negotiation request received", "info");
        setActiveTargetId(data.senderId);
        setIsIncomingCall(true);
        setIsInCall(true);
      } else if (data.type === MessageType.CALL_RESPONSE) {
        addLog(`Call response: ${data.content}`, "info");
        if (data.content === 'ACCEPT') {
          initiateWebRTCCall();
        } else {
          endCall();
        }
      } else if (data.type) {
        setMessages(prev => [...prev, data as ChatMessage]);
      }
    });
  };

  const handleIncomingChunk = (msg: ChatMessage) => {
    const tId = msg.transferId!;
    if (!incomingChunks.current[tId]) {
      addLog(`Starting file transfer: ${msg.fileName}`, "info");
      incomingChunks.current[tId] = { chunks: [], total: msg.totalChunks! };
    }
    
    incomingChunks.current[tId].chunks[msg.chunkIndex!] = msg.content;
    const received = Object.keys(incomingChunks.current[tId].chunks).length;
    const progress = Math.floor((received / msg.totalChunks!) * 100);
    setTransferProgress(prev => ({ ...prev, [tId]: progress }));

    if (received === msg.totalChunks) {
      addLog(`Transfer complete: ${msg.fileName}`, "success");
      const blob = new Blob(incomingChunks.current[tId].chunks);
      const finalMsg: ChatMessage = {
        ...msg,
        type: msg.fileName?.match(/\.(jpg|jpeg|png|gif)$/i) ? MessageType.IMAGE : MessageType.VIDEO_FILE,
        content: blob
      };
      setMessages(prev => [...prev, finalMsg]);
      delete incomingChunks.current[tId];
      setTransferProgress(prev => {
        const n = { ...prev };
        delete n[tId];
        return n;
      });
    }
  };

  const connectToPeer = () => {
    const id = targetIdInput.trim().toUpperCase();
    if (!id || !peerRef.current) return;
    
    addLog(`Initiating connection to ${id}...`, "info");
    setActiveTargetId(id);
    setStatus(ConnectionStatus.CONNECTING);

    // Set a timeout for connection attempt
    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = setTimeout(() => {
      if (status !== ConnectionStatus.CONNECTED) {
        addLog("Connection timeout. Peer might be offline or blocked by firewall.", "error");
        setStatus(ConnectionStatus.ERROR);
      }
    }, 15000);
    
    // Serialization 'json' is often more reliable than 'binary' across different browsers for basic objects
    const conn = peerRef.current.connect(id, { 
      reliable: true,
      serialization: 'json'
    });
    setupDataConnection(conn);
  };

  const copyMyId = () => {
    if (!myId) return;
    navigator.clipboard.writeText(myId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      addLog("Failed to copy ID: " + err, "error");
    });
  };

  const sendFile = async (file: File) => {
    if (!connRef.current || !connRef.current.open) {
      addLog("Cannot send file: Connection not open", "error");
      return;
    }
    const transferId = uuidv4();
    const arrayBuffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

    addLog(`Preparing file: ${file.name} (${totalChunks} chunks)`, "info");

    const previewMsg: ChatMessage = {
      id: uuidv4(),
      senderId: myId,
      type: MessageType.SYSTEM,
      content: `Sending: ${file.name}`,
      timestamp: Date.now(),
      transferId
    };
    setMessages(prev => [...prev, previewMsg]);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
      const chunk = arrayBuffer.slice(start, end);

      const chunkMsg: ChatMessage = {
        id: uuidv4(),
        senderId: myId,
        type: MessageType.CHUNK,
        content: chunk,
        timestamp: Date.now(),
        transferId,
        chunkIndex: i,
        totalChunks,
        fileName: file.name
      };

      try {
        connRef.current.send(chunkMsg);
      } catch (e) {
        addLog("Data channel interrupted during transfer", "error");
        break;
      }
      
      if (i % 10 === 0 || i === totalChunks - 1) {
        setTransferProgress(prev => ({ ...prev, [transferId]: Math.floor((i / totalChunks) * 100) }));
        await new Promise(r => setTimeout(r, 30)); // Slightly longer delay for stability
      }
    }
    
    setMessages(prev => [...prev, {
      id: transferId,
      senderId: myId,
      type: file.type.startsWith('image/') ? MessageType.IMAGE : MessageType.VIDEO_FILE,
      content: file,
      timestamp: Date.now(),
      fileName: file.name
    }]);
    setTransferProgress(prev => {
      const n = { ...prev };
      delete n[transferId];
      return n;
    });
  };

  const startCallNegotiation = () => {
    if (!connRef.current) return;
    addLog("Sending call request...", "info");
    setIsInCall(true);
    setIsIncomingCall(false);
    connRef.current.send({
      id: uuidv4(),
      senderId: myId,
      type: MessageType.CALL_REQUEST,
      content: null,
      timestamp: Date.now()
    });
  };

  const acceptCallNegotiation = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 }, 
        audio: true 
      });
      setLocalStream(stream);
      setIsIncomingCall(false);
      connRef.current.send({
        id: uuidv4(),
        senderId: myId,
        type: MessageType.CALL_RESPONSE,
        content: 'ACCEPT',
        timestamp: Date.now()
      });
    } catch (e) {
      addLog("Media access failed: " + e, "error");
      alert('Camera access denied');
      endCall();
    }
  };

  const initiateWebRTCCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 }, 
        audio: true 
      });
      setLocalStream(stream);
      const call = peerRef.current.call(activeTargetId, stream);
      callRef.current = call;
      call.on('stream', (remote: MediaStream) => setRemoteStream(remote));
      call.on('close', endCall);
      call.on('error', (err: any) => {
        addLog(`Call error: ${err.type}`, "error");
        endCall();
      });
    } catch (e) {
      addLog("Media access failed: " + e, "error");
      endCall();
    }
  };

  const endCall = () => {
    if (callRef.current) callRef.current.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setIsInCall(false);
    setIsIncomingCall(false);
    addLog("Call ended", "info");
  };

  const sendMessage = (content: any, type: MessageType = MessageType.TEXT) => {
    if (type === MessageType.TEXT) {
      if (!content.trim()) return;
      const msg = { id: uuidv4(), senderId: myId, type, content, timestamp: Date.now() };
      connRef.current?.send(msg);
      setMessages(prev => [...prev, msg]);
    } else {
      sendFile(content);
    }
  };

  if (isInCall) {
    return (
      <VideoCallOverlay 
        localStream={localStream}
        remoteStream={remoteStream}
        onEndCall={endCall}
        isIncoming={isIncomingCall}
        onAnswer={acceptCallNegotiation}
        remotePeerId={activeTargetId}
      />
    );
  }

  // Initial State / Login Screen
  if (status === ConnectionStatus.DISCONNECTED && messages.length === 0 && !activeTargetId) {
    return (
      <div className="flex flex-col h-screen bg-white safe-top safe-bottom">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-10 animate-in fade-in duration-700">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-[28px] mx-auto flex items-center justify-center text-white text-4xl font-black shadow-2xl shadow-blue-200 mb-6 rotate-3">
                <i className="ph-fill ph-link"></i>
              </div>
              <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">P2P Link</h1>
              <p className="text-gray-400 font-medium text-lg">Fast. Private. Serverless.</p>
            </div>

            <div className="bg-gray-50 p-7 rounded-[32px] border border-gray-100 shadow-sm relative group">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 text-center">My Sharing ID</p>
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200/50 shadow-inner">
                <span className="text-3xl font-mono font-black text-blue-600 tracking-tighter select-all">{myId || '---'}</span>
                <button 
                  onClick={copyMyId}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                    copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400 hover:text-blue-600'
                  }`}
                >
                  <i className={`ph-bold ${copied ? 'ph-check' : 'ph-copy'} text-xl`}></i>
                </button>
              </div>
              {copied && <p className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-black text-green-500 uppercase tracking-widest animate-in fade-in slide-in-from-top-2">Copied to clipboard</p>}
            </div>

            <div className="space-y-4 pt-4">
               <div className="relative">
                 <input 
                   value={targetIdInput} 
                   onChange={e => setTargetIdInput(e.target.value.toUpperCase())} 
                   placeholder="FRIEND ID"
                   className="w-full p-5 rounded-[24px] bg-white border-2 border-gray-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-center font-black text-2xl transition-all placeholder:text-gray-200 placeholder:font-bold tracking-widest"
                 />
                 <i className="ph-bold ph-user-focus absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 text-xl"></i>
               </div>
               <button 
                 onClick={connectToPeer} 
                 disabled={!targetIdInput}
                 className="w-full p-5 rounded-[24px] bg-gray-900 text-white font-black text-xl hover:bg-black transition-all active:scale-95 shadow-2xl shadow-gray-200 disabled:opacity-20 disabled:shadow-none"
               >
                 Connect Now
               </button>
            </div>
          </div>
        </div>

        {/* System Logs at bottom */}
        <div className="h-44 bg-gray-900 p-5 overflow-y-auto no-scrollbar rounded-t-[40px] border-t border-gray-800 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              Console Diagnostics
            </p>
          </div>
          <div className="space-y-2.5 font-mono text-[11px]">
            {logs.map(log => (
              <div key={log.id} className="flex gap-3 leading-relaxed">
                <span className="text-gray-600 shrink-0 select-none">[{log.time}]</span>
                <span className={`${
                  log.level === 'error' ? 'text-red-400' : 
                  log.level === 'success' ? 'text-green-400' : 
                  log.level === 'warn' ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-gray-700 italic">Listening for system events...</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white relative">
      {(status === ConnectionStatus.CONNECTING || status === ConnectionStatus.ERROR) && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-sm flex flex-col items-center gap-10">
            <div className="relative">
              <div className={`w-28 h-28 ${status === ConnectionStatus.ERROR ? 'bg-red-50' : 'bg-blue-50'} rounded-full flex items-center justify-center transition-colors duration-500`}>
                <i className={`ph-fill ${status === ConnectionStatus.ERROR ? 'ph-warning-octagon text-red-500' : 'ph-lightning text-blue-600'} text-5xl animate-pulse`}></i>
              </div>
              {status !== ConnectionStatus.ERROR && <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>}
            </div>
            
            <div className="text-center">
              <h2 className="text-3xl font-black text-gray-900 mb-2 tracking-tight">
                {status === ConnectionStatus.ERROR ? 'Connection Failed' : 'Establishing Link'}
              </h2>
              <p className="text-gray-400 font-bold text-lg">
                P2P handshake with <span className="text-blue-600">{activeTargetId}</span>
              </p>
            </div>

            <div className="w-full bg-gray-900 p-5 rounded-[32px] border border-gray-800 h-48 overflow-y-auto no-scrollbar font-mono text-[11px] space-y-2 shadow-2xl">
              {logs.map(log => (
                <div key={log.id} className={`flex gap-3 ${log.level === 'error' ? 'text-red-400' : log.level === 'success' ? 'text-green-400' : 'text-gray-500'}`}>
                  <span className="opacity-40">[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col w-full gap-4">
               {status === ConnectionStatus.ERROR && (
                 <button onClick={connectToPeer} className="w-full py-5 bg-blue-600 text-white font-black rounded-[24px] shadow-xl shadow-blue-100 active:scale-95 transition">
                    Retry Handshake
                 </button>
               )}
               <button onClick={() => window.location.reload()} className="w-full py-5 bg-gray-100 text-gray-500 font-black rounded-[24px] hover:bg-red-50 hover:text-red-500 transition-all active:scale-95">
                 Cancel Link
               </button>
            </div>
          </div>
        </div>
      )}

      <ChatInterface
        messages={messages}
        myId={myId}
        onSendMessage={sendMessage}
        onStartCall={startCallNegotiation}
        remotePeerId={activeTargetId}
        onDisconnect={() => window.location.reload()}
        status={status}
        onReconnect={connectToPeer}
        transferProgress={transferProgress}
        logs={logs}
      />
    </div>
  );
};

export default App;
