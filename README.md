# PulmoScan AI — PulmoScan breathing sound monitor

Interactive browser-based demo simulating a chest-worn acoustic sensor (ESP32-S3 with MEMS microphone) and an in-page Phone View companion.

## Getting Started

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## Live Sensor Notes

- **Web Bluetooth (BLE)**: Web Bluetooth requires desktop Chrome, Microsoft Edge, or Android Chrome over **HTTPS** or **http://localhost:3000**. Embedded iframe contexts may block `navigator.bluetooth` via permissions policy; open `http://localhost:3000` directly in a top-level browser tab to pair hardware.
- **Testing Wi-Fi Stream with a Local WebSocket Bridge**:
  1. Run a local WebSocket server on port `81` (e.g., `ws://192.168.4.1:81/audio` or `ws://localhost:81/audio`) that streams either raw 16 kHz Int16 LE PCM frames, PulmoScan 244-byte packets (`8 B` header + `236 B` audio = `118` samples), or JSON `{ "packetBase64": "..." }` / `{ "pcm16Base64": "..." }`.
  2. Open **1. Audio Acquisition → Connect Live Sensor → Wi-Fi Stream**, enter the `ws://` address (when running locally on `http://localhost:3000`) or `wss://` address (when hosted over HTTPS), and click **Receive**.
  3. Alternatively, host a CORS-enabled `.wav` or `.pcm` endpoint (e.g., `http://192.168.4.1/latest.wav`) and click **Fetch**.

## Verification

```bash
npm run lint
npm run build
```
