import WebSocket from 'ws';
import { saveTicket } from './db.js';

/**
 * System prompt strictly tailored for Partnex:
 * - Partnex is a premier software development service provider.
 * - We create every type of websites (custom portals, e-commerce, AI apps, SaaS, landing pages).
 * - Pricing can be seen on our website or discussed with our team member.
 * - Ask user what is their query/problem.
 * - Max 2 minutes call time.
 * - Tell them: "Got it! I have raised a ticket for your query, our admins/team will contact you shortly."
 * - When caller is satisfied or asks to end, call 'end_call' or 'raise_ticket'.
 */
export const PARTNEX_SYSTEM_PROMPT = `
You are the official AI Voice Support Assistant for "Partnex", a software development service provider.
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
5. As soon as the user states their query or requirement, invoke the tool 'raise_support_ticket' with their exact query summary.
6. Then say clearly: "Got it! I have raised a ticket for your request. Our admin team will contact you shortly on your number. Have a wonderful day!"
7. Once confirmed or when conversation reaches a natural close, execute the 'end_call' tool to hang up politely.
8. Keep your sentences brief, punchy, and conversational.
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
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com';
  // Convert http(s) baseUrl to ws(s)
  const wsBaseUrl = baseUrl.replace(/^http/, 'ws');
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';

  let callDurationSeconds = 0;
  let userQuery = '';
  let fullTranscription = [];
  let isCallActive = true;

  // Track call duration timer (Max 2 minutes = 120 seconds)
  const timerInterval = setInterval(() => {
    if (!isCallActive) return;
    callDurationSeconds += 1;

    // Send tick to client for visuals
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

    // Save ticket into SQLite database
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

  // If no OpenAI key is set, fallback to smart simulation mode so user can test UI & DB right away
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    console.warn('⚠️ No OPENAI_API_KEY provided. Running in Demo Simulation Mode for Partnex.');
    
    // Send simulated welcoming audio/speech event
    setTimeout(() => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({
          type: 'assistant_speech_start'
        }));
        clientWs.send(JSON.stringify({
          type: 'transcript',
          role: 'assistant',
          text: "Hello! Thank you for calling Partnex. How can I help you with your software development project today?"
        }));
        fullTranscription.push("Assistant: Hello! Thank you for calling Partnex. How can I help you with your software development project today?");
      }
    }, 1200);

    // Listen to client messages
    clientWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'user_query') {
          userQuery = msg.text;
          fullTranscription.push(`User: ${msg.text}`);
          
          setTimeout(() => {
            const reply = "Got it! We build all types of websites and web applications. I have raised a ticket for your request, and our admin team will contact you shortly on your number.";
            fullTranscription.push(`Assistant: ${reply}`);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify({ type: 'transcript', role: 'assistant', text: reply }));
            }
            setTimeout(() => {
              endCallGracefully('Ticket raised & admin notified');
            }, 5000);
          }, 1500);
        } else if (msg.type === 'hangup') {
          endCallGracefully('User ended call');
        }
      } catch (err) {
        console.error('Error in mock session:', err);
      }
    });

    clientWs.on('close', () => {
      endCallGracefully('Client closed tab');
    });

    return;
  }

  // Live OpenAI Realtime WebSocket connection
  const openAiWs = new WebSocket(`${wsBaseUrl}/v1/realtime?model=${model}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  openAiWs.on('open', () => {
    console.log('🤖 Connected to OpenAI Realtime for web caller');

    // Configure Partnex session
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

    // Prompt the AI to initiate greeting
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

      // Audio stream from OpenAI -> send to Browser
      if (event.type === 'response.audio.delta' && event.delta) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'audio_delta',
            delta: event.delta // base64 pcm16
          }));
        }
      }

      // Live transcript from AI
      if (event.type === 'response.audio_transcript.delta' && event.delta) {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'transcript_delta',
            role: 'assistant',
            delta: event.delta
          }));
        }
      }

      // User transcript from Whisper
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

      // Function execution
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

          // Confirm function result back to OpenAI
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

      // Speech interruption
      if (event.type === 'input_audio_buffer.speech_started') {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({ type: 'interrupt' }));
        }
      }
    } catch (err) {
      console.error('Error parsing OpenAI event:', err);
    }
  });

  // Handle audio coming from client browser microphone
  clientWs.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === 'audio_chunk' && msg.data) {
        if (openAiWs.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.data // base64 pcm16
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

  openAiWs.on('error', (err) => {
    console.error('OpenAI WebSocket error:', err.message);
  });
}
