import WebSocket from 'ws';
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

const TOOLS = [
  {
    type: "function",
    name: "raise_support_ticket",
    description: "Raise an internal support ticket in SQLite database with the user query.",
    parameters: {
      type: "object",
      properties: {
        query_summary: {
          type: "string",
          description: "Summary of the caller's software requirement, query, or problem"
        }
      },
      required: ["query_summary"]
    }
  },
  {
    type: "function",
    name: "end_call",
    description: "End the active phone/web call gracefully.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for ending call (e.g., ticket raised, caller satisfied, timeout)"
        }
      }
    }
  }
];

export function handleWebCallSession(clientWs, phone, callSid) {
  console.log(`\n🎙️ Starting Partnex Web Call for Phone: ${phone} (SID: ${callSid})`);

  const apiKey = process.env.OPENAI_API_KEY;
  const rawBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  // Strip trailing slashes and trailing /v1 for WebSocket root construction
  const cleanBase = rawBaseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  const wsBaseUrl = cleanBase.replace(/^http/, 'ws');
  const isDirectOpenAI = cleanBase.includes('openai.com');
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

  let callDurationSeconds = 0;
  let userQuery = '';
  let fullTranscription = [];
  let isCallActive = true;
  let openAiWs = null;
  let conversationHistory = [
    { role: 'system', content: PARTNEX_SYSTEM_PROMPT }
  ];

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

    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  }

  // --- REST FALLBACK (for AIMLAPI, OpenRouter, or other REST-only providers) ---
  function startRestVoiceAgent() {
    console.log('🤖 Running Universal Chat Voice Mode for Partnex');

    // Send initial spoken greeting to caller
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

    // Listen to user queries / transcripts from client
    clientWs.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === 'user_query' && msg.text) {
          const userText = msg.text.trim();
          console.log(`👤 User said: "${userText}"`);
          fullTranscription.push(`User: ${userText}`);
          conversationHistory.push({ role: 'user', content: userText });

          if (!userQuery) userQuery = userText;

          // Call REST API
          try {
            const endpoint = `${rawBaseUrl.replace(/\/+$/, '')}/chat/completions`;
            const chatRes = await fetch(endpoint, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: conversationHistory,
                max_tokens: 150,
                temperature: 0.7
              })
            });

            if (!chatRes.ok) {
              const errTxt = await chatRes.text();
              console.error('REST Chat error:', chatRes.status, errTxt);
              return;
            }

            const chatData = await chatRes.json();
            const reply = chatData.choices?.[0]?.message?.content || "Thank you for sharing. I have raised a ticket and our admin team will contact you shortly.";

            conversationHistory.push({ role: 'assistant', content: reply });
            fullTranscription.push(`Assistant: ${reply}`);

            // If user mentioned their problem or inquiry, log ticket
            if (fullTranscription.length >= 2) {
              saveTicket({
                callSid,
                phone,
                status: 'ticket_raised',
                durationSeconds: callDurationSeconds,
                query: userQuery,
                transcription: fullTranscription.join('\n')
              });
            }

            // Send spoken reply to client
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({
                type: 'transcript',
                role: 'assistant',
                text: reply,
                speak: true
              }));
            }

            // Check if call should conclude
            if (reply.toLowerCase().includes('raised a ticket') || reply.toLowerCase().includes('contact you shortly')) {
              setTimeout(() => {
                endCallGracefully('Ticket logged & admin notified');
              }, 6000);
            }

          } catch (apiErr) {
            console.error('Error calling REST endpoint:', apiErr);
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

  // If no OpenAI key is set, run simulated demo
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.warn('⚠️ No OPENAI_API_KEY provided. Running in Demo Simulation Mode for Partnex.');
    startRestVoiceAgent();
    return;
  }

  // If using AIMLAPI or other REST provider (which returns 404 for realtime websocket)
  if (!isDirectOpenAI) {
    console.log(`ℹ️ Non-OpenAI Base URL detected (${rawBaseUrl}). Using REST + Browser Speech Synthesis Voice Mode.`);
    startRestVoiceAgent();
    return;
  }

  // --- NATIVE OPENAI REALTIME WEBSOCKET ---
  const wsUrl = `${wsBaseUrl}/v1/realtime?model=${model}`;
  console.log(`Connecting to OpenAI Realtime: ${wsUrl}`);

  openAiWs = new WebSocket(wsUrl, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  openAiWs.on('open', () => {
    console.log('🤖 Connected to OpenAI Realtime for web caller');

    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: PARTNEX_SYSTEM_PROMPT,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: TOOLS,
        tool_choice: 'auto',
      },
    };
    openAiWs.send(JSON.stringify(sessionUpdate));

    openAiWs.send(JSON.stringify({
      type: 'response.create',
      response: {
        instructions: 'Greet the caller warmly by saying: "Hello! Thank you for calling Partnex. How can I help you with your software development project today?"'
      }
    }));
  });

  openAiWs.on('message', (raw) => {
    try {
      const event = JSON.parse(raw.toString());

      if (event.type === 'response.audio.delta' && event.delta) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'audio_delta',
            delta: event.delta
          }));
        }
      }

      if (event.type === 'response.audio_transcript.delta' && event.delta) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'transcript_delta',
            role: 'assistant',
            delta: event.delta
          }));
        }
      }

      if (event.type === 'conversation.item.input_audio_transcription.completed') {
        const text = event.transcript || '';
        if (text) {
          fullTranscription.push(`User: ${text}`);
          if (!userQuery) userQuery = text;
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              type: 'transcript',
              role: 'user',
              text
            }));
          }
        }
      }

      if (event.type === 'response.function_call_arguments.done') {
        const name = event.name;
        const callId = event.call_id;
        const args = JSON.parse(event.arguments || '{}');

        if (name === 'raise_support_ticket') {
          userQuery = args.query_summary || userQuery;
          console.log(`🎫 [PARTNEX TICKET CREATED]: "${userQuery}" for phone: ${phone}`);
          saveTicket({
            callSid,
            phone,
            status: 'ticket_raised',
            durationSeconds: callDurationSeconds,
            query: userQuery,
            transcription: fullTranscription.join('\n')
          });

          openAiWs.send(JSON.stringify({
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({
                status: 'success',
                message: 'Ticket successfully logged in Partnex database. Admin team notified.'
              })
            }
          }));
          openAiWs.send(JSON.stringify({ type: 'response.create' }));
        } else if (name === 'end_call') {
          console.log(`📞 AI requested call termination: ${args.reason || 'Normal'}`);
          setTimeout(() => {
            endCallGracefully(args.reason || 'Call concluded');
          }, 2000);
        }
      }

      if (event.type === 'input_audio_buffer.speech_started') {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'interrupt' }));
        }
      }
    } catch (err) {
      console.error('Error parsing OpenAI event:', err);
    }
  });

  openAiWs.on('error', (err) => {
    console.error('OpenAI WebSocket error:', err.message);
    // Fallback to REST voice agent if WebSocket rejected
    startRestVoiceAgent();
  });

  clientWs.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === 'audio_chunk' && msg.data) {
        if (openAiWs && openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.data
          }));
        }
      } else if (msg.type === 'hangup') {
        endCallGracefully('User hung up');
      }
    } catch (e) {
      console.error('Error reading browser client message:', e);
    }
  });

  clientWs.on('close', () => {
    endCallGracefully('Caller disconnected');
  });
}
