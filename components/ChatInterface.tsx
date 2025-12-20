
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MessageType, ConnectionStatus, LogEntry } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  myId: string;
  onSendMessage: (text: any, type?: MessageType) => void;
  onStartCall: () => void;
  remotePeerId: string;
  onDisconnect: () => void;
  status: ConnectionStatus;
  onReconnect: () => void;
  transferProgress: Record<string, number>;
  logs: LogEntry[];
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, myId, onSendMessage, onStartCall, remotePeerId, onDisconnect, status, transferProgress, logs 
}) => {
  const [inputText, setInputText] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, transferProgress]);

  const renderContent = (msg: ChatMessage) => {
    if (msg.type === MessageType.TEXT) return <p className="text-[15px] leading-relaxed">{msg.content}</p>;
    if (msg.type === MessageType.SYSTEM) return <p className="text-[11px] font-bold italic opacity-60">System: {msg.content}</p>;
    
    const url = msg.content instanceof Blob || msg.content instanceof File 
      ? URL.createObjectURL(msg.content) 
      : typeof msg.content === 'string' ? msg.content : null;

    if (msg.type === MessageType.IMAGE && url) return (
      <div className="relative group">
        <img src={url} className="rounded-xl max-h-72 object-cover border border-black/5" />
        <a href={url} download={msg.fileName || 'image.png'} className="absolute top-2 right-2 w-8 h-8 bg-black/50 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition">
          <i className="ph-bold ph-download-simple"></i>
        </a>
      </div>
    );
    
    if (msg.type === MessageType.VIDEO_FILE && url) return (
      <video src={url} controls className="rounded-xl max-h-72 bg-black shadow-inner" />
    );
    
    return <span className="text-xs opacity-50 italic">Media transfer error</span>;
  };

  return (
    <div className="flex flex-col h-full bg-white safe-top safe-bottom">
      {/* Dynamic Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-50 bg-white/80 backdrop-blur-lg sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button onClick={onDisconnect} className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-50 transition">
            <i className="ph-bold ph-arrow-left text-xl"></i>
          </button>
          <div>
            <h2 className="font-black text-lg tracking-tight">Peer {remotePeerId}</h2>
            <button 
              onClick={() => setShowLogs(!showLogs)} 
              className="flex items-center gap-1.5 active:opacity-60"
            >
              <span className={`w-2 h-2 rounded-full ${status === ConnectionStatus.CONNECTED ? 'bg-green-500' : 'bg-orange-500'} ${status === ConnectionStatus.CONNECTING ? 'animate-pulse' : ''}`}></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{status}</span>
              <i className={`ph-bold ${showLogs ? 'ph-caret-up' : 'ph-caret-down'} text-[8px] text-gray-300`}></i>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={onStartCall} 
            disabled={status !== ConnectionStatus.CONNECTED}
            className="w-11 h-11 bg-blue-600 text-white rounded-[16px] disabled:bg-gray-100 disabled:text-gray-300 transition-all active:scale-90 shadow-lg shadow-blue-100 flex items-center justify-center"
          >
            <i className="ph-fill ph-video-camera text-xl"></i>
          </button>
        </div>
      </header>

      {/* Connection Logs Panel */}
      {showLogs && (
        <div className="bg-gray-900 p-4 text-[10px] font-mono max-h-40 overflow-y-auto border-b border-gray-800 animate-in slide-in-from-top duration-300">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-500 font-black uppercase tracking-widest">Link Logs</span>
            <button onClick={() => setShowLogs(false)} className="text-gray-600 hover:text-white"><i className="ph-bold ph-x"></i></button>
          </div>
          <div className="space-y-1">
            {logs.map(log => (
              <div key={log.id} className="flex gap-2">
                <span className="text-gray-700">{log.time}</span>
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
      )}

      {/* Messages List */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar bg-gray-50/30">
        {messages.map(msg => (
          <div key={msg.id} className={`flex flex-col ${msg.senderId === myId ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-3xl shadow-sm ${
              msg.senderId === myId 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-white text-gray-800 rounded-tl-none border border-gray-100'
            }`}>
              {renderContent(msg)}
              
              {transferProgress[msg.transferId || ''] !== undefined && (
                <div className="mt-3 w-full bg-black/10 rounded-full h-1.5 overflow-hidden">
                   <div className="bg-white h-full transition-all duration-300 ease-out" style={{ width: `${transferProgress[msg.transferId!]}%` }}></div>
                </div>
              )}
            </div>
            <span className="text-[9px] text-gray-400 mt-1.5 px-2 font-bold uppercase tracking-wider">
              {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-20 pointer-events-none">
            <i className="ph-fill ph-chat-circle text-8xl mb-4"></i>
            <p className="font-black text-sm uppercase tracking-[0.4em]">Secure Link Ready</p>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100 flex items-center gap-3 safe-bottom">
        <input 
          type="file" 
          ref={fileRef} 
          className="hidden" 
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onSendMessage(file, file.type.startsWith('image/') ? MessageType.IMAGE : MessageType.VIDEO_FILE);
          }} 
        />
        <button 
          onClick={() => fileRef.current?.click()} 
          className="w-12 h-12 bg-gray-50 rounded-2xl text-gray-400 hover:bg-gray-100 transition-colors active:scale-90 flex items-center justify-center"
        >
          <i className="ph-bold ph-plus text-xl"></i>
        </button>
        <div className="flex-1 bg-gray-50 rounded-[20px] px-5 flex items-center border border-transparent focus-within:border-blue-100 focus-within:bg-white transition-all">
          <input 
            value={inputText} 
            onChange={e => setInputText(e.target.value)} 
            placeholder="Type a message..."
            onKeyDown={e => {
              if (e.key === 'Enter' && inputText.trim()) {
                onSendMessage(inputText);
                setInputText('');
              }
            }}
            className="w-full bg-transparent h-14 outline-none font-medium text-[15px] placeholder:text-gray-300"
          />
        </div>
        <button 
          onClick={() => {
            if (inputText.trim()) {
              onSendMessage(inputText);
              setInputText('');
            }
          }} 
          disabled={!inputText.trim()}
          className="w-12 h-12 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-100 disabled:opacity-30 transition-all active:scale-90 flex items-center justify-center"
        >
          <i className="ph-fill ph-paper-plane-right text-xl"></i>
        </button>
      </div>
    </div>
  );
};

export default ChatInterface;
