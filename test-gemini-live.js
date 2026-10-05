import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'your_gemini_api_key_here') {
  console.log('⚠️ Please add your GEMINI_API_KEY in .env to test.');
  process.exit(0);
}

console.log('🧪 Testing Gemini Live API connection...');

async function testGeminiLive() {
  try {
    const ai = new GoogleGenAI({ apiKey });
    const session = await ai.live.connect({
      model: 'gemini-2.0-flash-exp',
      config: {
        responseModalities: [Modality.AUDIO],
      },
      callbacks: {
        onopen: () => {
          console.log('✅ Connected to Gemini Live socket!');
          session.sendClientContent({
            turns: [{ role: 'user', parts: [{ text: 'Hello, this is a test call' }] }],
            turnComplete: true
          });
        },
        onmessage: (msg) => {
          console.log('📥 Message received from Gemini Live:', Object.keys(msg));
          if (msg.serverContent) {
            console.log('Server turn complete:', msg.serverContent.turnComplete);
            session.close();
            process.exit(0);
          }
        },
        onerror: (err) => {
          console.error('❌ Socket error:', err.message);
        },
        onclose: () => {
          console.log('Socket closed.');
        }
      }
    });
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}

testGeminiLive();
