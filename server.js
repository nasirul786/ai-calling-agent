import http from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import { handleWebCallSession } from './src/web-call-handler.js';
import './src/db.js'; // Ensure database initialized

dotenv.config();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Attach WebSocket server for real-time browser calling audio stream
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const { pathname, query } = parse(req.url, true);

    if (pathname === '/api/call-stream') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req, query);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req, query) => {
    const phone = query?.phone || 'Unknown';
    const callSid = `CALL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    handleWebCallSession(ws, phone, callSid);
  });

  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`\n🚀 Partnex AI Calling System running on http://localhost:${PORT}`);
    console.log(`🟠 Cloudflare Turnstile integration active`);
    console.log(`🎙️ Web Audio Stream available at: ws://localhost:${PORT}/api/call-stream\n`);
  });
});
