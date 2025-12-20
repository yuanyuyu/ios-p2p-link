
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
    
    // 增强的 WebRTC 配置以解决 negotiation-failed
    const newPeer = new Peer(peerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
          { urls: 'stun:stun.anyfirewall.com:3478' },
          { urls: 'stun:stun.voipbuster.com:3478' },
          { urls: 'stun:stun.sipgate.net:3478' }
        ],
        iceCandidatePoolSize: 10,
      }
    });

    newPeer.on('open', (id: string) => {
      addLog(`Signaling server connected. ID: ${id}`, "success");
    });

    newPeer.on('connection', (conn: any) => {
      addLog(`Incoming request from ${conn.peer}`, "info");
      setActiveTargetId(conn.peer);
      setupDataConnection(conn);
    });

    newPeer.on('call', (call: any) => {
      addLog(`Incoming call verified from ${call.peer}`, "success");
      callRef.current = call;
      call.on('stream', (remote: MediaStream) => {
        addLog("Remote stream synchronized", "success");
        setRemoteStream(remote);
      });
      call.on('close', endCall);
      call.on('error', (err: any) => {
        addLog(`Call error: ${err.type || 'media-failed'}`, "error");
        endCall();
      });
    });

    newPeer.on('error', (err: any) => {
      addLog(`System Error: ${err.type}`, "error");
      if (err.type === 'peer-unavailable') {
        addLog("Peer not found. They might be offline.", "warn");
        setStatus(ConnectionStatus.ERROR);
      }
    });

    peerRef.current = newPeer;
    return () => {
      newPeer.destroy();
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    };
  }, []);

  const setupDataConnection = (conn: any) => {
    // 关闭现有旧连接
    if (connRef.current && connRef.current.peer === conn.peer && connRef.current.open) {
      connRef.current.close();
    }
    
    connRef.current = conn;
    addLog(`Handshaking with ${conn.peer}...`, "info");

    conn.on('open', () => {
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      addLog("P2P Link established", "success");
      setStatus(ConnectionStatus.CONNECTED);
    });

    conn.on('close', () => {
      addLog("P2P Link closed", "warn");
      setStatus(ConnectionStatus.DISCONNECTED);
    });

    conn.on('error', (err: any) => {
      const errorMsg = err.type || (typeof err === 'string' ? err : 'connection-failed');
      addLog(`Data Channel Error: ${errorMsg}`, "error");
      
      if (errorMsg === 'negotiation-failed') {
        addLog("P2P negotiation failed. This is usually due to symmetric NAT or firewall. Try switching from WiFi to Cellular or vice versa.", "error");
      }
      setStatus(ConnectionStatus.ERROR);
    });
    
    conn.on('data', (data: any) => {
      if (!data) return;
      
      // 处理分片和业务逻辑
      if (data.type === MessageType.CHUNK) {
        handleIncomingChunk(data);
      } else if (data.type === MessageType.CALL_REQUEST) {
        setActiveTargetId(data.senderId);
        setIsIncomingCall(true);
        setIsInCall(true);
      } else if (data.type === MessageType.CALL_RESPONSE) {
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
      incomingChunks.current[tId] = { chunks: [], total: msg.totalChunks! };
    }
    
    incomingChunks.current[tId].chunks[msg.chunkIndex!] = msg.content;
    const received = Object.keys(incomingChunks.current[tId].chunks).length;
    const progress = Math.floor((received / msg.totalChunks!) * 100);
    setTransferProgress(prev => ({ ...prev, [tId]: progress }));

    if (received === msg.totalChunks) {
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
    
    if (id === myId) {
      addLog("Cannot connect to self", "warn");
      return;
    }

    addLog(`Connecting to ${id}...`, "info");
    setActiveTargetId(id);
    setStatus(ConnectionStatus.CONNECTING);

    if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
    connectionTimeoutRef.current = setTimeout(() => {
      if (status !== ConnectionStatus.CONNECTED) {
        addLog("Connection attempt timed out.", "error");
        setStatus(ConnectionStatus.ERROR);
      }
    }, 20000);
    
    // 使用 JSON 序列化提高跨设备稳定性，避开某些环境下的 Binary 序列化 Bug
    const conn = peerRef.current.connect(id, { 
      reliable: true,
      serialization: 'json'
    });
    setupDataConnection(conn);
  };

  const copyMyId = () => {
    if (!myId) return;
    const el = document.createElement('textarea');
    el.value = myId;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    setCopied(true);
    addLog("ID copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const sendFile = async (file: File) => {
    if (!connRef.current || !connRef.current.open) {
      addLog("Connection not ready", "error");
      return;
    }
    const transferId = uuidv4();
    const arrayBuffer = await file.arrayBuffer();
    const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

    addLog(`Transferring ${file.name}...`, "info");

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
      if (!connRef.current?.open) break;
      
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
      
      if (i % 5 === 0 || i === totalChunks - 1) {
        setTransferProgress(prev => ({ ...prev, [transferId]: Math.floor((i / totalChunks) * 100) }));
        await new Promise(r => setTimeout(r, 50)); 
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
    if (!connRef.current?.open) return;
    addLog("Requesting video call...", "info");
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
      if (connRef.current?.open) {
        connRef.current.send({
          id: uuidv4(),
          senderId: myId,
          type: MessageType.CALL_RESPONSE,
          content: 'ACCEPT',
          timestamp: Date.now()
        });
      }
    } catch (e) {
      addLog("Media permission denied", "error");
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
      call.on('error', () => endCall());
    } catch (e) {
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
    addLog("Call disconnected", "info");
  };

  const sendMessage = (content: any, type: MessageType = MessageType.TEXT) => {
    if (!connRef.current?.open) {
      addLog("Cannot send: Link not open", "warn");
      return;
    }
    if (type === MessageType.TEXT) {
      if (!content.trim()) return;
      const msg = { id: uuidv4(), senderId: myId, type, content, timestamp: Date.now() };
      connRef.current.send(msg);
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

  if (status === ConnectionStatus.DISCONNECTED && messages.length === 0 && !activeTargetId) {
    return (
      <div className="flex flex-col h-screen bg-white safe-top safe-bottom">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-sm space-y-10">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-600 rounded-[28px] mx-auto flex items-center justify-center text-white text-4xl font-black shadow-2xl mb-6 rotate-3">
                <i className="ph-fill ph-link"></i>
              </div>
              <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tight">P2P Link</h1>
              <p className="text-gray-400 font-medium text-lg">Fast. Private. Direct.</p>
            </div>

            <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100 shadow-sm relative">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 text-center">My Sharing ID</p>
              <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-200 shadow-inner">
                <span className="text-3xl font-mono font-black text-blue-600 tracking-tighter">{myId || '---'}</span>
                <button 
                  onClick={copyMyId}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all active:scale-90 ${
                    copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  <i className={`ph-bold ${copied ? 'ph-check' : 'ph-copy'} text-xl`}></i>
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-4">
               <input 
                 value={targetIdInput} 
                 onChange={e => setTargetIdInput(e.target.value.toUpperCase())} 
                 placeholder="ENTER FRIEND ID"
                 className="w-full p-5 rounded-[24px] bg-white border-2 border-gray-100 shadow-sm focus:border-blue-500 outline-none text-center font-black text-2xl"
               />
               <button 
                 onClick={connectToPeer} 
                 disabled={!targetIdInput}
                 className="w-full p-5 rounded-[24px] bg-gray-900 text-white font-black text-xl hover:bg-black transition-all active:scale-95 disabled:opacity-20"
               >
                 Connect Now
               </button>
            </div>
          </div>
        </div>

        <div className="h-40 bg-gray-900 p-5 overflow-y-auto no-scrollbar rounded-t-[40px] border-t border-gray-800">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            System Diagnostics
          </p>
          <div className="space-y-2 font-mono text-[11px]">
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
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white relative">
      {(status === ConnectionStatus.CONNECTING || status === ConnectionStatus.ERROR) && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in">
          <div className="w-full max-w-sm flex flex-col items-center gap-8">
            <div className={`w-24 h-24 ${status === ConnectionStatus.ERROR ? 'bg-red-50' : 'bg-blue-50'} rounded-full flex items-center justify-center`}>
              <i className={`ph-fill ${status === ConnectionStatus.ERROR ? 'ph-warning-octagon text-red-500' : 'ph-lightning text-blue-600'} text-4xl animate-pulse`}></i>
            </div>
            
            <div className="text-center">
              <h2 className="text-2xl font-black text-gray-900 mb-1">
                {status === ConnectionStatus.ERROR ? 'Link Error' : 'Negotiating Link'}
              </h2>
              <p className="text-gray-400 font-bold">With Peer: <span className="text-blue-600">{activeTargetId}</span></p>
            </div>

            <div className="w-full bg-gray-900 p-4 rounded-[24px] h-40 overflow-y-auto no-scrollbar font-mono text-[10px] space-y-1">
              {logs.map(log => (
                <div key={log.id} className={`flex gap-2 ${log.level === 'error' ? 'text-red-400' : 'text-gray-500'}`}>
                  <span>[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-col w-full gap-3">
              {status === ConnectionStatus.ERROR && (
                <button onClick={connectToPeer} className="w-full py-4 bg-blue-600 text-white font-black rounded-2xl active:scale-95 transition">Retry Link</button>
              )}
              <button onClick={() => window.location.reload()} className="w-full py-4 bg-gray-100 text-gray-500 font-black rounded-2xl active:scale-95 transition">Cancel</button>
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
