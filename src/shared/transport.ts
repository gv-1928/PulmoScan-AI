import {
  BLE_CONFIG,
  BlePacket,
  SessionRecord,
  TransportType,
  chunkPayload,
  reassemblePackets,
} from './contract.ts';

export type LedState = 'idle' | 'recording' | 'processing' | 'sent' | 'repeat' | 'error';

export interface DeviceState {
  name: string;
  isConnected: boolean;
  transportMode: TransportType;
  mtu: number;
  batteryPercent: number;
  firmware: string;
  ledState: LedState;
  packetLossPercent: number;
  wifiLatencyMs: number;
  wifiSsid: string;
  lastActive: number;
}

export interface TransportMessage {
  type:
    | 'DEVICE_STATE'
    | 'CONNECT_REQ'
    | 'CONNECT_ACK'
    | 'DISCONNECT'
    | 'PACKET'
    | 'WIFI_REPORT'
    | 'NACK'
    | 'ACK';
  sender: 'console' | 'companion';
  timestamp: number;
  payload: any;
}

export type MessageListener = (msg: TransportMessage) => void;

class TransportChannelManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<MessageListener> = new Set();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel('pulmoscan_virtual_bus');
      this.channel.onmessage = (event) => {
        this.listeners.forEach((l) => l(event.data));
      };
    }
    // Also listen to storage for cross-domain/fallback if needed
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === 'pulmoscan_bus_msg' && e.newValue) {
          try {
            const parsed = JSON.parse(e.newValue);
            this.listeners.forEach((l) => l(parsed));
          } catch {}
        }
      });
    }
  }

  public send(msg: TransportMessage) {
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (err) {
        console.warn('BroadcastChannel error, falling back to localStorage', err);
      }
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(
          'pulmoscan_bus_msg',
          JSON.stringify({ ...msg, _t: Date.now() })
        );
      } catch {}
    }
  }

  public subscribe(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const virtualBus = new TransportChannelManager();

export const INITIAL_DEVICE_STATE: DeviceState = {
  name: BLE_CONFIG.DEVICE_NAME,
  isConnected: true,
  transportMode: 'wifi',
  mtu: BLE_CONFIG.DEFAULT_MTU,
  batteryPercent: 88,
  firmware: 'sim-2.0',
  ledState: 'idle',
  packetLossPercent: 0,
  wifiLatencyMs: 38,
  wifiSsid: 'Clinic-Mesh-5G',
  lastActive: Date.now(),
};
