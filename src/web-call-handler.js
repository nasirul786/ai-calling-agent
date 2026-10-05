import WebSocket from 'ws';
import { GoogleGenAI, Modality, MediaResolution } from '@google/genai';
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
5. When the user explains their query or requirement, acknowledge it politely, and say clearly: "Got it! I have noted your requirement and raised a ticket for you. Our admin team will contact you shortly on your number. Have a wonderful day!"
6. Keep spoken sentences brief, natural, and conversational for a live phone conversation.
`;

export function handleWebCallSession(clientWs, phone, callSid) {
  console.log(`\n🎙️ Starting Partnex Web Call for Phone: ${phone} (SID: ${callSid})`);

  let callDurationSeconds = 0;
  let userQuery = '';
  let fullTranscription = [];
  let isCallActive = true;
  let geminiSession = null;

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
      try {
        geminiSession.close();
      } catch (e) {
        console.error('Error closing Gemini session:', e);
      }
    }
  }

  // Fallback demo mode if no GEMINI_API_KEY is configured
  function startSimulationMode() {
    console.warn('⚠️ No valid GEMINI_API_KEY found. Running in demo simulation mode for Partnex.');

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
          fullTranscription.push(`User: ${userText}`);
          if (!userQuery) userQuery = userText;

          const reply = "Got it! We build all types of websites and web applications. I have raised a ticket for your request, and our admin team will contact you shortly.";
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

          setTimeout(() => {
            endCallGracefully('Ticket logged & admin notified');
          }, 6000);
        } else if (msg.type === 'hangup') {
          endCallGracefully('User hung up');
        }
      } catch (err) {
        console.error('Simulation error:', err);
      }
    });

    clientWs.on('close', () => {
      endCallGracefully('Client closed call');
    });
  }

  // Connect to Google Gemini 3.8 Live API
  async function startGemini38Live(geminiKey) {
    const rawModel = process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live';
    const model = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;
    const voiceName = process.env.GEMINI_VOICE_NAME || 'Autonoe';

    console.log(`🤖 Connecting to Google Gemini Live API...`);
    console.log(`📡 Model: ${model}`);
    console.log(`🗣️ Voice: ${voiceName}`);

    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });

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
        systemInstruction: {
          parts: [{ text: PARTNEX_SYSTEM_PROMPT }]
        }
      };

      geminiSession = await ai.live.connect({
        model,
        callbacks: {
          onopen: function () {
            console.log('✅ Connected to Google Gemini 3.8 Live API');
          },
          onmessage: function (message) {
            try {
              const parts = message.serverContent?.modelTurn?.parts || [];

              for (const part of parts) {
                // Audio data from Gemini Live
                if (part.inlineData && part.inlineData.data) {
                  if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(JSON.stringify({
                      type: 'audio_delta',
                      delta: part.inlineData.data, // base64 PCM / audio chunk
                      mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                    }));
                  }
                }

                // Text transcript from Gemini
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

                  // Auto ticket creation if ticket raised
                  if (part.text.toLowerCase().includes('raised a ticket') || part.text.toLowerCase().includes('contact you shortly')) {
                    saveTicket({
                      callSid,
                      phone,
                      status: 'ticket_raised',
                      durationSeconds: callDurationSeconds,
                      query: userQuery || 'Software development inquiry',
                      transcription: fullTranscription.join('\n')
                    });
                  }
                }
              }

              // Interruption signal from Gemini VAD
              if (message.serverContent?.interrupted) {
                if (clientWs.readyState === WebSocket.OPEN) {
                  clientWs.send(JSON.stringify({ type: 'interrupt' }));
                }
              }
            } catch (err) {
              console.error('Error processing Gemini Live message:', err);
            }
          },
          onerror: function (e) {
            console.error('❌ Gemini Live Error:', e?.message || e);
            startSimulationMode();
          },
          onclose: function (e) {
            console.log('Gemini Live session closed:', e?.reason || 'Done');
          }
        },
        config
      });

      // Send initial trigger to produce greeting voice
      try {
        geminiSession.sendClientContent({
          turns: [
            {
              role: 'user',
              parts: [{
                text: 'Greet the caller warmly by saying: "Hello! Thank you for calling Partnex. How can I help you with your software development project today?"'
              }]
            }
          ],
          turnComplete: true
        });
      } catch (err) {
        console.error('Error triggering initial greeting:', err);
      }

      // Handle audio and text messages from browser
      clientWs.on('message', (message) => {
        try {
          const msg = JSON.parse(message.toString());

          if (msg.type === 'audio_chunk' && msg.data) {
            if (geminiSession) {
              geminiSession.sendRealtimeInput({
                media: {
                  mimeType: 'audio/pcm;rate=24000',
                  data: msg.data
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
          console.error('Error handling client message:', e);
        }
      });

      clientWs.on('close', () => {
        endCallGracefully('Caller disconnected');
      });

    } catch (err) {
      console.error('Failed to connect to Gemini 3.8 Live API:', err.message);
      startSimulationMode();
    }
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== 'your_gemini_api_key_here') {
    startGemini38Live(geminiKey);
  } else {
    startSimulationMode();
  }
}
