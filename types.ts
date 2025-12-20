
export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO_FILE = 'VIDEO_FILE',
  CHUNK = 'CHUNK', 
  CHUNK_END = 'CHUNK_END', 
  CALL_REQUEST = 'CALL_REQUEST', 
  CALL_RESPONSE = 'CALL_RESPONSE', 
  SYSTEM = 'SYSTEM'
}

export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  content: any;
  timestamp: number;
  fileName?: string;
  totalChunks?: number;
  chunkIndex?: number;
  transferId?: string;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export interface LogEntry {
  id: string;
  time: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}
