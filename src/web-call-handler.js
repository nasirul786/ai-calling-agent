import WebSocket from 'ws';
import { GoogleGenAI, Modality } from '@google/genai';
import { saveTicket } from './db.js';

export const PARTNEX_SYSTEM_PROMPT = `
You are the official AI Voice Support Assistant for "Partnex", a premier software development service provider.
Language: English (warm, polite, professional, conversational). If the user speaks Hindi, comfortably respond in polite Hindi/Hinglish.

Company Knowledge:
1. Partnex is a software development service provider.
2. We create every type of website and web application (custom SaaS platforms, business websites, e-commerce, web portals, mobile-friendly web apps, AI integrations).
3. Regarding pricing: State politely that our pricing is transparent and flexible, and can be seen on our website or directly discussed with our team member when they connect.
4. Call Duration Limit: This call is strictly focused and limited to a maximum of 2 minutes.

Conversation Flow:
1. Greet the caller warmly: "Hello, thank you for calling Partnex! How can I help you with your software or website project today?"
2. Ask and listen carefully to what their query, requirement, or problem is.
3. If they ask what websites we make: "We build all kinds of websites and web applications, from custom web portals and SaaS platforms to e-commerce and business sites."
4. If they ask about cost/pricing: "Our pricing can be seen on our website, or you can discuss customized rates directly with our team member."
5. When the user states their query or requirement, summarize it, and say clearly: "Got it! I have noted your requirement and raised a ticket for you. Our admin team will contact you shortly on your number. Have a wonderful day!"
6. Keep your spoken sentences brief, natural, and conversational for a voice phone conversation.
`;

export function handleWebCallSession(clientWs, phone, callSid) {
  console.log(`\n🎙️ Starting Partnex Web Call for Phone: ${phone} (SID: ${callSid})`);

  let callDurationSeconds = 0;
  let userQuery = '';
  let fullTranscription = [];
  let isCallActive = true;
  let geminiSession = null;
  let openAiWs = null;

  // Track call duration timer (Max 2 minutes = 120 seconds)
  const timerInterval = setInterval(() => {
    if (!isCallActive) return;
    callDurationSeconds += 1;

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type: 'timer', seconds: callDurationSeconds }));
    }

    if (callDurationSeconds >= 120) {
      console.log(`⏱️ 2-minute call limit reached for ${phone}. Ending call.`);
      endCallGracefully('2-minute limit reached');
    }
  }, 1000);

  function endCallGracefully(reason = 'Completed') {
    if (!isCallActive) return;
    isCallActive = false;
    clearInterval(timerInterval);

    saveTicket({
      callSid,
      phone,
      status: 'completed',
      durationSeconds: callDurationSeconds,
      query: userQuery || 'Inquired about Partnex software development',
      transcription: fullTranscription.join('\n')
    });

    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'call_ended',
        reason,
        duration: callDurationSeconds
      }));
      clientWs.close();
    }

    if (geminiSession) {
      try { geminiSession.close(); } catch (e) {}
    }

    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      try { openAiWs.close(); } catch (e) {}
    }
  }

  // --- REST / SIMULATION FALLBACK ---
  function startRestVoiceAgent() {
    console.log('🤖 Running Universal Chat Voice Mode for Partnex');

    const greeting = "Hello, thank you for calling Partnex! How can I help you with your software development project today?";
    fullTranscription.push(`Assistant: ${greeting}`);

    setTimeout(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'transcript',
          role: 'assistant',
          text: greeting,
          speak: true
        }));
      }
    }, 600);

    clientWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'user_query' && msg.text) {
          const userText = msg.text.trim();
          console.log(`👤 User said: "${userText}"`);
          fullTranscription.push(`User: ${userText}`);
          if (!userQuery) userQuery = userText;

          // If Gemini API key is present, use Gemini generateContent
          const geminiKey = process.env.GEMINI_API_KEY;
          let reply = "Got it! We build all types of websites and web applications. I have raised a ticket for your request, and our admin team will contact you shortly.";

          if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
            try {
              const ai = new GoogleGenAI({ apiKey: geminiKey });
              const res = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                  { role: 'user', parts: [{ text: `${PARTNEX_SYSTEM_PROMPT}\n\nUser: ${userText}\nAssistant:` }] }
                ]
              });
              reply = res.text || reply;
            } catch (err) {
              console.warn('Gemini generateContent fallback error:', err.message);
            }
          }

          fullTranscription.push(`Assistant: ${reply}`);

          saveTicket({
            callSid,
            phone,
            status: 'ticket_raised',
            durationSeconds: callDurationSeconds,
            query: userQuery,
            transcription: fullTranscription.join('\n')
          });

          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'transcript',
              role: 'assistant',
              text: reply,
              speak: true
            }));
          }

          if (reply.toLowerCase().includes('raised a ticket') || reply.toLowerCase().includes('contact you shortly')) {
            setTimeout(() => {
              endCallGracefully('Ticket logged & admin notified');
            }, 6000);
          }
        } else if (msg.type === 'hangup') {
          endCallGracefully('User hung up');
        }
      } catch (err) {
        console.error('Error handling client message:', err);
      }
    });

    clientWs.on('close', () => {
      endCallGracefully('Client closed call');
    });
  }

  // --- GEMINI LIVE API INTEGRATION ---
  async function startGeminiLiveSession(geminiKey) {
    console.log('🤖 Connecting to Gemini Live API with @google/genai...');
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const model = process.env.GEMINI_LIVE_MODEL || 'gemini-2.0-flash-exp';

      geminiSession = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: {
            parts: [{ text: PARTNEX_SYSTEM_PROMPT }]
          },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede' // Warm, professional voice
              }
            }
          }
        },
        callbacks: {
          onopen: () => {
            console.log('✅ Connected to Google Gemini Live API');
            // Send initial prompt turn to trigger greeting
            try {
              geminiSession.sendClientContent({
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: 'Greet the caller warmly by saying: "Hello! Thank you for calling Partnex. How can I help you with your software development project today?"' }]
                  }
                ],
                turnComplete: true
              });
            } catch (e) {
              console.error('Error sending initial turn to Gemini:', e);
            }
          },
          onmessage: (message) => {
            try {
              // Extract model turn content
              const parts = message.serverContent?.modelTurn?.parts || [];
              for (const part of parts) {
                // If audio data returned by Gemini Live
                if (part.inlineData && part.inlineData.data) {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                      type: 'audio_delta',
                      delta: part.inlineData.data // base64 PCM audio chunk
                    }));
                  }
                }
                // If text transcript returned by Gemini
                if (part.text) {
                  fullTranscription.push(`Assistant: ${part.text}`);
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                      type: 'transcript',
                      role: 'assistant',
                      text: part.text,
                      speak: true
                    }));
                  }
                }
              }

              // Handle interruption signal from Gemini
              if (message.serverContent?.interrupted) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'interrupt' }));
                }
              }
            } catch (err) {
              console.error('Error in Gemini Live message callback:', err);
            }
          },
          onerror: (e) => {
            console.error('❌ Gemini Live WebSocket error:', e?.message || e);
            startRestVoiceAgent();
          },
          onclose: (e) => {
            console.log('Gemini Live session closed:', e?.reason || '');
          }
        }
      });

      // Stream incoming browser microphone audio chunk directly into Gemini Live
      clientWs.on('message', (message) => {
        try {
          const msg = JSON.parse(message.toString());

          if (msg.type === 'audio_chunk' && msg.data) {
            if (geminiSession) {
              geminiSession.sendRealtimeInput({
                media: {
                  mimeType: 'audio/pcm;rate=24000',
                  data: msg.data // base64 PCM16
                }
              });
            }
          } else if (msg.type === 'user_query' && msg.text) {
            const userText = msg.text.trim();
            fullTranscription.push(`User: ${userText}`);
            if (!userQuery) userQuery = userText;

            if (geminiSession) {
              geminiSession.sendClientContent({
                turns: [{ role: 'user', parts: [{ text: userText }] }],
                turnComplete: true
              });
            }
          } else if (msg.type === 'hangup') {
            endCallGracefully('User hung up');
          }
        } catch (e) {
          console.error('Error handling client message in Gemini session:', e);
        }
      });

      clientWs.on('close', () => {
        endCallGracefully('Caller disconnected');
      });

    } catch (err) {
      console.error('Failed to initialize Gemini Live session:', err.message);
      startRestVoiceAgent();
    }
  }

  // --- DECIDE PROVIDER ---
  const geminiKey = process.env.GEMINI_API_KEY;
  const aiProvider = process.env.AI_PROVIDER || 'gemini';

  if (aiProvider === 'gemini' && geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    startGeminiLiveSession(geminiKey);
    return;
  }

  // Otherwise, fallback to Rest / Simulation agent
  startRestVoiceAgent();
}
