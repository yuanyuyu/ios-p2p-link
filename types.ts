
// PeerJS types are loaded via global script, but we define interfaces for safety
export interface PeerJS {
  new (id?: string, options?: any): any;
  on(event: string, callback: (data: any) => void): void;
  connect(id: string): any;
  call(id: string, stream: MediaStream): any;
  destroy(): void;
  id: string;
}

declare global {
  interface Window {
    Peer: any;
  }
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO_FILE = 'VIDEO_FILE',
  SYSTEM = 'SYSTEM'
}

export interface ChatMessage {
  id: string;
  senderId: string;
  type: MessageType;
  content: any; // 更改为 any，支持 string 或 Blob
  timestamp: number;
  fileName?: string;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}
