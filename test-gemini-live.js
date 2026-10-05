import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'your_gemini_api_key_here') {
  console.log('⚠️ Please add your GEMINI_API_KEY in .env before running this test.');
  process.exit(0);
}

const rawModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
const model = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;
const voiceName = process.env.GEMINI_VOICE_NAME || 'Autonoe';

console.log(`🧪 Testing Gemini 3.8 Live API with Voice: ${voiceName}...`);
console.log(`📡 Model: ${model}`);

async function testGemini38Live() {
  try {
    const ai = new GoogleGenAI({ apiKey });

    const config = {
      responseModalities: [Modality.AUDIO],
      mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voiceName,
          }
        }
      },
      contextWindowCompression: {
        triggerTokens: '104857',
        slidingWindow: { targetTokens: '52428' },
      },
    };

    const session = await ai.live.connect({
      model,
      callbacks: {
        onopen: function () {
          console.log('✅ Successfully connected to Gemini 3.8 Live socket!');
          session.sendClientContent({
            turns: [
              {
                role: 'user',
                parts: [{ text: 'Hello, this is a test from Partnex AI web calling agent.' }]
              }
            ],
            turnComplete: true
          });
        },
        onmessage: function (message) {
          console.log('📥 Message received from Gemini Live API');
          const parts = message.serverContent?.modelTurn?.parts || [];
          for (const p of parts) {
            if (p.inlineData) {
              console.log(`🔊 Audio data received (${p.inlineData.mimeType}), size: ${p.inlineData.data?.length} chars`);
            }
            if (p.text) {
              console.log(`💬 Transcript: ${p.text}`);
            }
          }
          if (message.serverContent?.turnComplete) {
            console.log('🎉 Turn complete! Closing test session.');
            session.close();
            process.exit(0);
          }
        },
        onerror: function (err) {
          console.error('❌ Socket Error:', err?.message || err);
        },
        onclose: function (e) {
          console.log('Session closed:', e?.reason || 'OK');
        }
      },
      config
    });

  } catch (err) {
    console.error('Failed to connect:', err.message);
  }
}

testGemini38Live();
