const apiKey = '24bb4e7cc49e54439c07f28ba9e49276';

async function testTTS() {
  const res = await fetch('https://api.aimlapi.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: '#synthflow', // or tts-1
      input: 'Hello, thank you for calling Partnex!',
      voice: 'alloy'
    })
  });
  console.log('TTS Status:', res.status, res.statusText);
  if (!res.ok) {
    console.log('TTS Error body:', await res.text());
  } else {
    const blob = await res.arrayBuffer();
    console.log('TTS Success! Audio bytes received:', blob.byteLength);
  }
}

testTTS();
