import http from 'http';

function testEndpoint(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('🧪 1. Testing Cloudflare Turnstile Verification API endpoint...');
  const turnstileRes = await testEndpoint('/api/verify-turnstile', 'POST', {
    token: '1x00000000000000000000AA',
    phone: '+91 9988776655'
  });
  console.log('Turnstile Response:', turnstileRes);

  console.log('\n🧪 2. Testing Partnex Ticket SQLite API endpoint...');
  const ticketRes = await testEndpoint('/api/ticket', 'POST', {
    callSid: `WEB-TEST-${Date.now()}`,
    phone: '+91 9988776655',
    status: 'completed',
    durationSeconds: 78,
    query: 'User wants a CRM web application built by Partnex',
    transcription: 'User: We want a custom CRM.\nAssistant: Partnex creates every type of website. Ticket logged.'
  });
  console.log('Ticket API Response:', ticketRes);

  console.log('\n🧪 3. Fetching tickets from SQLite via GET /api/ticket...');
  const listRes = await testEndpoint('/api/ticket', 'GET');
  console.log('Ticket List from DB:', listRes.body);

  process.exit(0);
}

run().catch((e) => {
  console.error('Test error:', e);
  process.exit(1);
});
