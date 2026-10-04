import WebSocket from 'ws';

const apiKey = '24bb4e7cc49e54439c07f28ba9e49276';
const baseUrl = 'https://api.aimlapi.com/v1';

// Test 1: wss://api.aimlapi.com/v1/realtime?model=gpt-4o-realtime-preview
console.log('Testing AIMLAPI WebSocket connection...');

const cleanBase = baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
const testUrls = [
  `${baseUrl.replace(/^http/, 'ws')}/realtime?model=gpt-4o-realtime-preview`,
  `${cleanBase.replace(/^http/, 'ws')}/v1/realtime?model=gpt-4o-realtime-preview`,
  `${cleanBase.replace(/^http/, 'ws')}/realtime?model=gpt-4o-realtime-preview`
];

for (const url of testUrls) {
  console.log(`Trying URL: ${url}`);
  try {
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    ws.on('open', () => {
      console.log(`✅ Success! Connected to: ${url}`);
      ws.close();
    });

    ws.on('error', (err) => {
      console.log(`❌ Failed for ${url}: ${err.message}`);
    });
  } catch (e) {
    console.log(`Exception for ${url}: ${e.message}`);
  }
}

// Check REST endpoint also
fetch('https://api.aimlapi.com/v1/models', {
  headers: {
    Authorization: `Bearer ${apiKey}`
  }
}).then(res => res.json()).then(data => {
  console.log('Models response status/data:', Array.isArray(data) ? data.length : data?.data?.length || data);
}).catch(err => {
  console.error('REST models error:', err.message);
});
