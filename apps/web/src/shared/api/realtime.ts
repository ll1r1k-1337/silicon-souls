export interface RealtimeEvent {
  channel: 'system-log-changed' | 'background-job-updated' | 'llm-message';
  sessionId?: string;
  jobId?: string;
  payload?: Record<string, unknown>;
}

const baseApiUrl = import.meta.env.VITE_API_URL ?? '/api';
const wsUrl = baseApiUrl.replace(/^http/, 'ws').replace(/\/api\/?$/, '/ws');

class RealtimeClient {
  private socket?: WebSocket;
  private listeners = new Set<(event: RealtimeEvent) => void>();

  connect(): void {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }
    this.socket = new WebSocket(wsUrl);
    this.socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data as string) as RealtimeEvent;
        this.listeners.forEach((listener) => listener(event));
      } catch {
        // noop
      }
    };
  }

  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.connect();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const realtimeClient = new RealtimeClient();
