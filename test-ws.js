import WebSocket from 'ws';

console.log('🧪 Testing WebSocket Audio Stream at ws://localhost:3000/api/call-stream...');

const ws = new WebSocket('ws://localhost:3000/api/call-stream?phone=%2B919988776655');

ws.on('open', () => {
  console.log('✅ WebSocket connection successfully established with Partnex agent server!');

  // Send a test message simulating user query
  setTimeout(() => {
    console.log('📤 Sending user query message to agent...');
    ws.send(JSON.stringify({
      type: 'user_query',
      text: 'I want an AI web application for real estate'
    }));
  }, 1000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📥 Message received from Agent Server:', msg.type, msg.text || msg.reason || '');

  if (msg.type === 'call_ended' || msg.text?.includes('ticket')) {
    console.log('🎉 Flow verification completed! Closing test connection.');
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});
