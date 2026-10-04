import http from 'http';
import { WebSocket } from 'ws';

const PORT = 5000;

console.log('Testing AI Calling Agent Server...');

const req = http.get(`http://localhost:${PORT}/health`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('✅ Health check passed:', data);

    // Test Inbound Call Webhook
    const callReq = http.request({
      hostname: 'localhost',
      port: PORT,
      path: '/incoming-call?From=%2B919876543210',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (callRes) => {
      let xml = '';
      callRes.on('data', chunk => xml += chunk);
      callRes.on('end', () => {
        console.log('✅ Inbound Call Webhook response received:');
        console.log(xml);
        process.exit(0);
      });
    });

    callReq.on('error', (err) => {
      console.error('❌ Call Webhook error:', err.message);
      process.exit(1);
    });
    callReq.end();
  });
});

req.on('error', (err) => {
  console.error('❌ Server health check failed (Make sure server is running):', err.message);
  process.exit(1);
});
