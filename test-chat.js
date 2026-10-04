const apiKey = '24bb4e7cc49e54439c07f28ba9e49276';

async function testChat() {
  const res = await fetch('https://api.aimlapi.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'Say hello in 5 words' }
      ]
    })
  });
  console.log('Chat Status:', res.status);
  const data = await res.json();
  console.log('Chat response:', data.choices?.[0]?.message?.content || data);
}

testChat();
