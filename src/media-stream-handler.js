import WebSocket from 'ws';

/**
 * System prompt instructing ChatGPT to act as a friendly Indian customer support agent,
 * listen to the caller's issue, gather key details, and state that a ticket has been raised.
 */
const SYSTEM_PROMPT = `
You are a warm, courteous, and highly professional Indian customer service voice agent named "Aarav".
Language: English with a clear, polite Indian accent tone, and optionally Hindi/Hinglish if the user prefers speaking in Hindi.

Your primary mission:
1. Greet the caller warmly: "Hello, thank you for calling support! How may I help you today?"
2. Actively listen to their problem or query. If the explanation is brief, ask a quick follow-up question to clarify the issue (e.g., "Could you please tell me a bit more about what went wrong?").
3. Once you understand the issue or after the user explains it, acknowledge and reassure them politely.
4. Execute the tool 'raise_support_ticket' with the caller's issue description and urgency.
5. Say clearly and politely: "Got it! I have noted your issue and raised ticket for you. Our admin team will review it and contact you shortly. Is there anything else I can help you with today?"
6. Keep spoken sentences concise and natural for a voice phone conversation. Avoid long bullet lists or formatting symbols.
`;

/**
 * Function definition for raising a support ticket
 */
const TOOLS = [
  {
    type: "function",
    name: "raise_support_ticket",
    description: "Raise an internal support ticket when the caller describes their issue.",
    parameters: {
      type: "object",
      properties: {
        issue_summary: {
          type: "string",
          description: "Summary of the caller's problem"
        },
        urgency: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Urgency level based on caller description"
        }
      },
      required: ["issue_summary"]
    }
  }
];

export function setupCallWebSocket(telephonyWs) {
  let streamSid = null;
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.error('❌ Missing OPENAI_API_KEY in environment variables.');
    telephonyWs.close();
    return;
  }

  // Connect to OpenAI Realtime API WebSocket
  const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
  const openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${model}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  // When OpenAI connection opens, configure session
  openAiWs.on('open', () => {
    console.log('🤖 Connected to OpenAI Realtime API');

    // Configure session audio format (g711_ulaw is standard telephony audio format)
    const sessionUpdate = {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        instructions: SYSTEM_PROMPT,
        voice: 'alloy', // Options: alloy, echo, shimmer, ash, ballad, coral, sage, verse
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
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
  });

  // Handle messages from OpenAI Realtime API
  openAiWs.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Stream AI audio chunks back to the telephony caller
      if (response.type === 'response.audio.delta' && response.delta) {
        if (telephonyWs.readyState === WebSocket.OPEN && streamSid) {
          const mediaMessage = {
            event: 'media',
            streamSid: streamSid,
            media: {
              payload: response.delta,
            },
          };
          telephonyWs.send(JSON.stringify(mediaMessage));
        }
      }

      // Handle function / tool calling (Raising ticket)
      if (response.type === 'response.function_call_arguments.done') {
        const functionName = response.name;
        const callId = response.call_id;
        const args = JSON.parse(response.arguments || '{}');

        if (functionName === 'raise_support_ticket') {
          console.log('\n🎫 [TICKET RAISED AUTOMATICALLY]');
          console.log(`Issue: ${args.issue_summary}`);
          console.log(`Urgency: ${args.urgency || 'medium'}`);
          const ticketId = `TICK-${Math.floor(100000 + Math.random() * 900000)}`;
          console.log(`Ticket ID generated: ${ticketId}\n`);

          // Send tool output back to OpenAI so it can confirm to caller
          const functionOutput = {
            type: 'conversation.item.create',
            item: {
              type: 'function_call_output',
              call_id: callId,
              output: JSON.stringify({
                status: 'success',
                ticket_id: ticketId,
                message: 'Ticket recorded successfully. Admins will contact user.'
              })
            }
          };
          openAiWs.send(JSON.stringify(functionOutput));
          // Ask OpenAI to formulate spoken response
          openAiWs.send(JSON.stringify({ type: 'response.create' }));
        }
      }

      // User speech interrupted AI - stop playback on phone
      if (response.type === 'input_audio_buffer.speech_started') {
        if (telephonyWs.readyState === WebSocket.OPEN && streamSid) {
          telephonyWs.send(JSON.stringify({
            event: 'clear',
            streamSid: streamSid
          }));
        }
      }

    } catch (err) {
      console.error('Error parsing OpenAI message:', err);
    }
  });

  // Handle incoming audio from Telephony (Caller speaking)
  telephonyWs.on('message', (message) => {
    try {
      const msg = JSON.parse(message.toString());

      switch (msg.event) {
        case 'start':
          streamSid = msg.start.streamSid;
          console.log(`🎙️ Audio stream started. Stream SID: ${streamSid}`);
          break;

        case 'media':
          // Forward caller's live audio chunk directly to OpenAI Realtime buffer
          if (openAiWs.readyState === WebSocket.OPEN) {
            const audioAppend = {
              type: 'input_audio_buffer.append',
              audio: msg.media.payload, // base64 encoded g711_ulaw
            };
            openAiWs.send(JSON.stringify(audioAppend));
          }
          break;

        case 'stop':
          console.log(`🛑 Audio stream stopped for Stream SID: ${streamSid}`);
          if (openAiWs.readyState === WebSocket.OPEN) {
            openAiWs.close();
          }
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling telephony message:', err);
    }
  });

  telephonyWs.on('close', () => {
    console.log('📞 Telephony call connection closed.');
    if (openAiWs.readyState === WebSocket.OPEN) {
      openAiWs.close();
    }
  });

  openAiWs.on('error', (err) => {
    console.error('OpenAI WebSocket error:', err.message);
  });

  telephonyWs.on('error', (err) => {
    console.error('Telephony WebSocket error:', err.message);
  });
}
