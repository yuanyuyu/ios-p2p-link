
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
  
  const [isInCall, setIsInCall] = useState(false);
  const [isIncomingCall, setIsIncomingCall] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const callRef = useRef<any>(null);
  const incomingChunks = useRef<Record<string, { chunks: any[], total: number }>>({});

  const addLog = (message: string, level: LogEntry['level'] = 'info') => {
    const newLog: LogEntry = {
      id: uuidv4(),
      time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message,
      level
    };
    setLogs(prev => [newLog, ...prev].slice(0, 50));
    console.log(`[${level.toUpperCase()}] ${message}`);
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
          { urls: 'stun:stun.anyfirewall.com:3478' }
        ]
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
      call.on('close', () => {
        addLog("Call ended by remote", "warn");
        endCall();
      });
      call.on('error', (err: any) => {
        addLog(`Call error: ${err.type}`, "error");
        endCall();
      });
    });

    newPeer.on('error', (err: any) => {
      addLog(`Peer system error: ${err.type}`, "error");
      if (err.type === 'peer-unavailable') {
        addLog("Peer not found. Check if the ID is correct.", "warn");
        setStatus(ConnectionStatus.ERROR);
      }
    });

    peerRef.current = newPeer;
    return () => newPeer.destroy();
  }, []);

  const setupDataConnection = (conn: any) => {
    connRef.current = conn;
    addLog(`Negotiating data channel with ${conn.peer}...`, "info");

    conn.on('open', () => {
      addLog("P2P Data Channel established successfully", "success");
      setStatus(ConnectionStatus.CONNECTED);
    });

    conn.on('close', () => {
      addLog("P2P Link disconnected", "warn");
      setStatus(ConnectionStatus.DISCONNECTED);
    });

    conn.on('error', (err: any) => {
      addLog(`Data channel error: ${err}`, "error");
      setStatus(ConnectionStatus.ERROR);
    });
    
    conn.on('data', (data: ChatMessage) => {
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
          addLog("Peer accepted call, initiating WebRTC media sync...", "info");
          initiateWebRTCCall();
        } else {
          addLog("Peer rejected the call", "warn");
          endCall();
        }
      } else {
        setMessages(prev => [...prev, data]);
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
    
    const conn = peerRef.current.connect(id, { 
      reliable: true,
      serialization: 'binary' // 强制二进制确保兼容性
    });
    setupDataConnection(conn);
  };

  const sendFile = async (file: File) => {
    if (!connRef.current) return;
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

      connRef.current.send(chunkMsg);
      
      if (i % 10 === 0 || i === totalChunks - 1) {
        setTransferProgress(prev => ({ ...prev, [transferId]: Math.floor((i / totalChunks) * 100) }));
        await new Promise(r => setTimeout(r, 20)); // 给流留点空间
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
    addLog("Sending call request to peer...", "info");
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
      addLog("Accessing media devices...", "info");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 }, 
        audio: true 
      });
      addLog("Local media devices ready", "success");
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
      addLog("Accessing media devices for caller...", "info");
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user', width: 640, height: 480 }, 
        audio: true 
      });
      addLog("Caller media devices ready", "success");
      setLocalStream(stream);
      const call = peerRef.current.call(activeTargetId, stream);
      callRef.current = call;
      addLog("WebRTC Media Connection handshake started", "info");
      call.on('stream', (remote: MediaStream) => {
        addLog("Remote stream received by caller", "success");
        setRemoteStream(remote);
      });
      call.on('close', endCall);
      call.on('error', (err: any) => {
        addLog(`Call error (caller side): ${err.type}`, "error");
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
    addLog("Call cleanup complete", "info");
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
      <div className="flex flex-col h-screen bg-gray-50 safe-top safe-bottom">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-8 animate-in fade-in duration-700">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-[28px] mx-auto flex items-center justify-center text-white text-4xl font-black shadow-2xl shadow-blue-200 mb-6 rotate-3">
                <i className="ph-fill ph-link"></i>
              </div>
              <h1 className="text-3xl font-black text-gray-900 mb-2">P2P Link</h1>
              <p className="text-gray-400 font-medium">Serverless private communication</p>
            </div>

            <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 text-center">My Sharing ID</p>
              <div className="bg-gray-50 p-4 rounded-2xl flex items-center justify-center">
                <span className="text-3xl font-mono font-black text-blue-600 tracking-tighter">{myId || '---'}</span>
              </div>
            </div>

            <div className="space-y-4">
               <input 
                 value={targetIdInput} 
                 onChange={e => setTargetIdInput(e.target.value.toUpperCase())} 
                 placeholder="FRIEND ID"
                 className="w-full p-5 rounded-[24px] bg-white border border-gray-100 shadow-sm focus:border-blue-500 focus:ring-4 focus:ring-blue-50 outline-none text-center font-bold text-xl transition-all"
               />
               <button 
                 onClick={connectToPeer} 
                 className="w-full p-5 rounded-[24px] bg-gray-900 text-white font-black text-lg hover:bg-black transition-all active:scale-95 shadow-xl"
               >
                 Connect Now
               </button>
            </div>
          </div>
        </div>

        {/* Diagnostic Logs for connection phase */}
        <div className="h-48 bg-gray-900 p-4 overflow-y-auto no-scrollbar rounded-t-[32px] border-t border-gray-800">
          <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            System Diagnostics
          </p>
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex gap-3 text-[11px] font-mono leading-relaxed">
                <span className="text-gray-600 shrink-0">{log.time}</span>
                <span className={`${
                  log.level === 'error' ? 'text-red-400' : 
                  log.level === 'success' ? 'text-green-400' : 
                  log.level === 'warn' ? 'text-yellow-400' : 'text-gray-400'
                }`}>
                  {log.message}
                </span>
              </div>
            ))}
            {logs.length === 0 && <p className="text-gray-700 italic">Waiting for connection attempt...</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white relative">
      {status !== ConnectionStatus.CONNECTED && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="w-full max-w-sm flex flex-col items-center gap-8">
            <div className="relative">
              <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
                <i className="ph-fill ph-lightning text-4xl text-blue-600 animate-pulse"></i>
              </div>
              <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
            
            <div className="text-center">
              <h2 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">Establishing Link</h2>
              <p className="text-gray-400 font-bold">Negotiating P2P with <span className="text-blue-600">{activeTargetId}</span></p>
            </div>

            <div className="w-full bg-gray-50 p-4 rounded-3xl border border-gray-100 max-h-40 overflow-y-auto no-scrollbar font-mono text-[10px] space-y-1">
              {logs.slice(0, 10).map(log => (
                <div key={log.id} className={`flex gap-2 ${log.level === 'error' ? 'text-red-500' : log.level === 'success' ? 'text-green-600' : 'text-gray-500'}`}>
                  <span>[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>

            <button onClick={() => window.location.reload()} className="text-red-500 font-black text-xs uppercase tracking-widest px-8 py-3 rounded-full hover:bg-red-50 transition">
              Abort Connection
            </button>
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
