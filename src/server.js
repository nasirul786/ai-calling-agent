import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { setupCallWebSocket } from './media-stream-handler.js';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 5000;

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * Exotel / Twilio Voice Webhook for Inbound Calls
 * When an Indian caller dials your number, Exotel/Twilio hits this endpoint.
 * It instructs the telecom carrier to open a bi-directional audio WebSocket stream.
 */
app.all('/incoming-call', (req, res) => {
  console.log('Incoming call received:', req.body || req.query);

  const callerNumber = req.body?.From || req.query?.From || 'Unknown';
  console.log(`Caller from: ${callerNumber}`);

  const host = process.env.SERVER_DOMAIN || req.headers.host;
  const streamUrl = `wss://${host}/media-stream`;

  // Standard Voice Streaming XML response (Supported by Exotel Voice Stream / Twilio Stream)
  // Bi-directional PCM / G.711 u-law audio stream
  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polite" language="en-IN">Connecting to support assistant.</Say>
    <Connect>
        <Stream url="${streamUrl}">
            <Parameter name="caller" value="${callerNumber}" />
        </Stream>
    </Connect>
</Response>`;

  res.type('text/xml');
  res.send(responseXml);
});

// Create HTTP server & attach WebSocket Server for live audio streaming
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/media-stream' });

wss.on('connection', (telephonyWs, req) => {
  console.log('📞 Telephony client connected for live audio streaming');
  setupCallWebSocket(telephonyWs);
});

server.listen(PORT, () => {
  console.log(`🚀 AI Calling Agent server running on port ${PORT}`);
  console.log(`📡 Inbound Webhook URL: http://localhost:${PORT}/incoming-call`);
});
