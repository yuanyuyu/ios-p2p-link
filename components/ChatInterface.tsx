
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, MessageType, ConnectionStatus } from '../types';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  myId: string;
  onSendMessage: (text: string, type?: MessageType, fileName?: string) => void;
  onStartCall: () => void;
  remotePeerId: string;
  onDisconnect: () => void;
  status: ConnectionStatus;
  onReconnect: () => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  messages, 
  myId, 
  onSendMessage, 
  onStartCall, 
  remotePeerId,
  onDisconnect,
  status,
  onReconnect
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!inputText.trim() || status !== ConnectionStatus.CONNECTED) return;
    onSendMessage(inputText, MessageType.TEXT);
    setInputText('');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || status !== ConnectionStatus.CONNECTED) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const type = file.type.startsWith('image/') ? MessageType.IMAGE : MessageType.VIDEO_FILE;
      onSendMessage(base64, type, file.name);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isConnected = status === ConnectionStatus.CONNECTED;
  const isDisconnected = status === ConnectionStatus.DISCONNECTED || status === ConnectionStatus.ERROR;
  const isConnecting = status === ConnectionStatus.CONNECTING;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-4 bg-white border-b border-gray-50 safe-top z-20">
        <div className="flex items-center gap-3">
            <button onClick={onDisconnect} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 transition" title="Exit">
                <i className="ph-bold ph-caret-left text-xl"></i>
            </button>
            <div className="flex flex-col">
              <h1 className="font-black text-gray-900 text-lg leading-none tracking-tight">
                Peer {remotePeerId}
              </h1>
              <p className={`text-[10px] uppercase tracking-widest font-black flex items-center gap-1.5 mt-1.5 ${
                isConnected ? "text-green-500" : isConnecting ? "text-orange-500" : "text-gray-300"
              }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isConnected ? "bg-green-500 animate-pulse" : isConnecting ? "bg-orange-500 animate-bounce" : "bg-gray-300"
                  }`}></span>
                  {isConnected ? "Secure" : isConnecting ? "Linking" : "Paused"}
              </p>
            </div>
        </div>
        
        <div className="flex gap-2">
          {isDisconnected && messages.length > 0 && (
            <button 
              onClick={onReconnect}
              className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center active:bg-blue-100 transition"
            >
              <i className="ph-bold ph-arrows-clockwise text-xl"></i>
            </button>
          )}
          
          <button 
            onClick={onStartCall}
            disabled={!isConnected}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              isConnected 
                ? "bg-gray-900 text-white active:scale-90" 
                : "bg-gray-50 text-gray-200 cursor-not-allowed"
            }`}
          >
            <i className="ph-fill ph-video-camera text-xl"></i>
          </button>
        </div>
      </header>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4 no-scrollbar bg-white">
        {messages.length === 0 && isConnected && (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 space-y-2 opacity-50">
                <i className="ph-bold ph-lock-key text-3xl"></i>
                <p className="text-xs font-bold uppercase tracking-widest">End-to-End Encrypted</p>
            </div>
        )}
        
        {messages.map((msg) => {
          const isMe = msg.senderId === myId;
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div 
                className={`max-w-[85%] rounded-[20px] px-4 py-3 ${
                  isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}
              >
                {msg.type === MessageType.TEXT && <p className="text-[15px] font-medium leading-relaxed break-words">{msg.content}</p>}
                
                {msg.type === MessageType.IMAGE && (
                  <div className="my-1">
                    <img src={msg.content} alt="Shared" className="rounded-xl max-h-72 object-cover border border-black/5" />
                  </div>
                )}

                {msg.type === MessageType.VIDEO_FILE && (
                   <div className="my-1">
                     <video src={msg.content} controls className="rounded-xl max-h-72 w-full bg-black shadow-lg" />
                     {msg.fileName && <p className="text-[10px] opacity-60 mt-2 font-bold truncate">{msg.fileName}</p>}
                   </div>
                )}
                
                <span className={`text-[9px] font-black uppercase tracking-tighter mt-1.5 block opacity-40`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={`p-4 safe-bottom transition-all duration-500 ${
        !isConnected ? "bg-gray-50 opacity-80" : "bg-white"
      }`}>
        {!isConnected && messages.length > 0 ? (
           <button 
             onClick={onReconnect}
             className="w-full py-4 rounded-2xl bg-blue-600 text-white font-bold shadow-xl shadow-blue-100 active:scale-98 transition flex items-center justify-center gap-3"
           >
             <i className="ph-bold ph-lightning"></i>
             Reconnect Link
           </button>
        ) : (
          <div className="flex items-end gap-3 max-w-4xl mx-auto">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={!isConnected}
              className="w-12 h-12 rounded-2xl bg-gray-50 text-gray-400 flex-shrink-0 flex items-center justify-center active:bg-gray-100 transition disabled:opacity-30"
            >
              <i className="ph-bold ph-plus text-xl"></i>
            </button>
            
            <div className="flex-1 bg-gray-50 rounded-[22px] flex items-center px-4 py-3 min-h-[48px] border border-gray-100">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Message..."
                disabled={!isConnected}
                className="w-full bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-300 text-[16px] font-medium resize-none h-6 leading-5 no-scrollbar disabled:cursor-not-allowed"
                rows={1}
                onKeyDown={(e) => {
                    if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                    }
                }}
              />
            </div>

            <button 
              onClick={handleSend}
              disabled={!inputText.trim() || !isConnected}
              className={`w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center transition-all ${
                inputText.trim() && isConnected ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 active:scale-90' : 'bg-gray-100 text-gray-300'
              }`}
            >
              <i className="ph-fill ph-paper-plane-right text-xl"></i>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatInterface;
