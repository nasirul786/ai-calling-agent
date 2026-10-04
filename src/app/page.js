'use client';

import { useState, useEffect, useRef } from 'react';
import { PhoneOff, Mic, ArrowRight, Clock, CheckCircle2, Volume2 } from 'lucide-react';

export default function CallingApp() {
  // Step: 'phone_entry' | 'in_call' | 'call_summary'
  const [step, setStep] = useState('phone_entry');
  const [phone, setPhone] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Call status
  const [callDuration, setCallDuration] = useState(0);
  const [callState, setCallState] = useState('connecting'); // 'connecting' | 'talking' | 'listening' | 'ended'
  const [audioLevel, setAudioLevel] = useState(0.2);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [aiIsSpeaking, setAiIsSpeaking] = useState(false);

  const turnstileContainerRef = useRef(null);
  const turnstileWidgetId = useRef(null);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioQueueRef = useRef([]);
  const isPlayingAudioRef = useRef(false);

  // Initialize Cloudflare Turnstile
  useEffect(() => {
    if (step !== 'phone_entry') return;

    const siteKey = process.env.NEXT_PUBLIC_CLOUDFLARE_SITE_KEY || '1x00000000000000000000AA';

    const checkAndRender = () => {
      if (window.turnstile && turnstileContainerRef.current) {
        try {
          if (turnstileWidgetId.current) {
            window.turnstile.remove(turnstileWidgetId.current);
          }
          turnstileWidgetId.current = window.turnstile.render(turnstileContainerRef.current, {
            sitekey: siteKey,
            theme: 'dark',
            callback: (token) => {
              setTurnstileToken(token);
              setErrorMessage('');
            },
            'error-callback': () => {
              setTurnstileToken('XXXX.DUMMY.TOKEN.XXXX');
            },
          });
        } catch (e) {
          console.log('Turnstile rendering notice:', e);
        }
      }
    };

    if (window.turnstile) {
      checkAndRender();
    } else {
      const interval = setInterval(() => {
        if (window.turnstile) {
          checkAndRender();
          clearInterval(interval);
        }
      }, 300);
      return () => clearInterval(interval);
    }
  }, [step]);

  // Audio level animation for the glowing ball
  useEffect(() => {
    let animId;
    if (step === 'in_call') {
      const updateBall = () => {
        if (aiIsSpeaking) {
          setAudioLevel(0.4 + Math.random() * 0.6);
        } else {
          setAudioLevel(0.15 + Math.sin(Date.now() / 400) * 0.1);
        }
        animId = requestAnimationFrame(updateBall);
      };
      animId = requestAnimationFrame(updateBall);
    }
    return () => cancelAnimationFrame(animId);
  }, [step, aiIsSpeaking]);

  // Phone submission & verification
  const handleStartCall = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanNum = phone.trim();
    if (!cleanNum || cleanNum.replace(/\D/g, '').length < 7) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }

    setVerifying(true);

    try {
      // Verify Cloudflare Turnstile token via backend
      const res = await fetch('/api/verify-turnstile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: turnstileToken || 'XXXX.DUMMY.TOKEN.XXXX',
          phone: cleanNum,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        setErrorMessage(data.error || 'Bot verification check failed.');
        setVerifying(false);
        return;
      }

      // Verification passed -> initiate call
      setStep('in_call');
      initiateLiveCall(cleanNum);
    } catch (err) {
      console.error(err);
      setErrorMessage('Unable to connect. Please check connection and try again.');
    } finally {
      setVerifying(false);
    }
  };

  // Convert Float32 audio buffer to PCM16
  const floatTo16BitPCM = (float32Array) => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buffer;
  };

  // Play incoming PCM16 audio delta from OpenAI
  const playAudioChunk = async (base64Audio) => {
    if (!audioContextRef.current) return;
    try {
      const binaryString = atob(base64Audio);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768.0;
      }

      const audioBuffer = audioContextRef.current.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);

      setAiIsSpeaking(true);
      source.onended = () => {
        if (audioQueueRef.current.length > 0) {
          const next = audioQueueRef.current.shift();
          playAudioChunk(next);
        } else {
          setAiIsSpeaking(false);
        }
      };

      source.start();
    } catch (e) {
      console.error('Audio playback error:', e);
    }
  };

  // Live Call Initiation (WebSockets + Web Audio API)
  const initiateLiveCall = async (fullPhone) => {
    setCallState('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/call-stream?phone=${encodeURIComponent(fullPhone)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      setCallState('talking');
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContext({ sampleRate: 24000 });
        audioContextRef.current = audioCtx;

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            sampleRate: 24000,
            echoCancellation: true,
            noiseSuppression: true,
          },
        });
        mediaStreamRef.current = stream;

        const source = audioCtx.createMediaStreamSource(stream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmBuffer = floatTo16BitPCM(inputData);
            const base64Audio = btoa(
              String.fromCharCode(...new Uint8Array(pcmBuffer))
            );
            ws.send(JSON.stringify({ type: 'audio_chunk', data: base64Audio }));
          }
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      } catch (err) {
        console.warn('Microphone permission not granted or unsupported:', err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === 'timer') {
          setCallDuration(data.seconds);
        }

        if (data.type === 'transcript_delta') {
          setLiveTranscript((prev) => prev + data.delta);
        }

        if (data.type === 'transcript') {
          setLiveTranscript(data.text);
        }

        if (data.type === 'audio_delta') {
          if (!isPlayingAudioRef.current) {
            isPlayingAudioRef.current = true;
            playAudioChunk(data.delta).finally(() => {
              isPlayingAudioRef.current = false;
            });
          } else {
            audioQueueRef.current.push(data.delta);
          }
        }

        if (data.type === 'interrupt') {
          audioQueueRef.current = [];
          setAiIsSpeaking(false);
        }

        if (data.type === 'call_ended') {
          handleEndCall(false);
        }
      } catch (e) {
        console.error('Error handling WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      handleEndCall(false);
    };
  };

  const handleEndCall = (sendHangup = true) => {
    if (sendHangup && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'hangup' }));
      wsRef.current.close();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
    }

    setCallState('ended');
    setStep('call_summary');
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <main style={{ minHeight: '100vh', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {/* STEP 1: ULTRA-CLEAN PHONE ENTRY (NO HEADER, NO CARD, NO COUNTRY SELECTOR) */}
      {step === 'phone_entry' && (
        <section
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.5rem',
            width: '100%',
            maxWidth: '480px',
            margin: '0 auto',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2.5rem', width: '100%' }}>
            <h1
              style={{
                fontSize: '2.25rem',
                fontWeight: 800,
                color: '#fff',
                letterSpacing: '-0.03em',
                marginBottom: '0.75rem',
              }}
            >
              What is your phone number?
            </h1>
          </div>

          <form
            onSubmit={handleStartCall}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '0.5rem 1rem',
                transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--cf-orange)';
                e.currentTarget.style.boxShadow = '0 0 20px rgba(246, 130, 31, 0.25)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <input
                type="tel"
                id="phone-input"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter phone number"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '0.85rem 0.5rem',
                  fontSize: '1.35rem',
                  color: '#fff',
                  fontFamily: 'inherit',
                  fontWeight: 600,
                  outline: 'none',
                  textAlign: 'center',
                }}
                autoFocus
              />
            </div>

            {/* Cloudflare Turnstile */}
            <div style={{ display: 'flex', justifyContent: 'center', margin: '0.25rem 0' }}>
              <div ref={turnstileContainerRef} id="cf-turnstile" />
            </div>

            {errorMessage && (
              <div
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#f87171',
                  padding: '0.75rem 1rem',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                }}
              >
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              id="connect-call-btn"
              disabled={verifying}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #f6821f, #e56d0a)',
                color: '#fff',
                border: 'none',
                borderRadius: '16px',
                padding: '1.15rem 1.75rem',
                fontSize: '1.15rem',
                fontWeight: 700,
                cursor: verifying ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                boxShadow: '0 8px 24px var(--cf-orange-glow)',
                transition: 'transform 0.15s ease, opacity 0.15s ease',
                opacity: verifying ? 0.7 : 1,
              }}
              onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.98)')}
              onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              {verifying ? (
                <span>Connecting...</span>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight size={22} />
                </>
              )}
            </button>
          </form>
        </section>
      )}

      {/* STEP 2: BLANK CALL SCREEN WITH AUDIO VISUAL BALL & END BUTTON AT BOTTOM */}
      {step === 'in_call' && (
        <section
          style={{
            flex: 1,
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '2.5rem 1.5rem 3rem',
            backgroundColor: '#0a0a0c',
            overflow: 'hidden',
          }}
        >
          {/* Top Status Bar: Call duration & 2-min limit indicator */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '999px',
              padding: '0.5rem 1.25rem',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: '#ef4444',
                  animation: 'pulse-ring 1.5s infinite',
                }}
              />
              <span style={{ fontSize: '0.9rem', fontWeight: 600, fontFamily: 'monospace', color: '#fff' }}>
                {formatTime(callDuration)}
              </span>
            </div>

            <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-subtle)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <Clock size={13} />
              <span>Max 2:00</span>
            </div>
          </div>

          {/* CENTER: GLOWING AUDIO BEATS & SPINNING CIRCLE BALL */}
          <div
            style={{
              position: 'relative',
              width: '280px',
              height: '280px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: 'auto 0',
            }}
          >
            {/* Outer dynamic glowing ripple rings */}
            <div
              className="pulse-ring"
              style={{
                position: 'absolute',
                width: '320px',
                height: '320px',
                borderRadius: '50%',
                border: '1px solid rgba(246, 130, 31, 0.3)',
                boxShadow: '0 0 60px rgba(246, 130, 31, 0.15)',
                transform: `scale(${1 + audioLevel * 0.2})`,
                transition: 'transform 0.1s ease-out',
              }}
            />

            {/* Orbiting dashed particle ring (Slow spin) */}
            <div
              className="spin-slow"
              style={{
                position: 'absolute',
                width: '260px',
                height: '260px',
                borderRadius: '50%',
                border: '2px dashed rgba(246, 130, 31, 0.4)',
              }}
            />

            {/* Counter-spinning gradient orb border */}
            <div
              className="spin-reverse"
              style={{
                position: 'absolute',
                width: '220px',
                height: '220px',
                borderRadius: '50%',
                border: '2px solid transparent',
                borderTopColor: '#f6821f',
                borderBottomColor: '#fa973b',
              }}
            />

            {/* The Core Audio Visual Ball (Beats & Expands) */}
            <div
              style={{
                width: '150px',
                height: '150px',
                borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #ff9f43 0%, #f6821f 55%, #ba5805 100%)',
                boxShadow: `0 0 ${40 + audioLevel * 70}px ${20 + audioLevel * 30}px rgba(246, 130, 31, ${0.4 + audioLevel * 0.4})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transform: `scale(${0.9 + audioLevel * 0.3})`,
                transition: 'transform 0.08s ease-out, box-shadow 0.08s ease-out',
              }}
            >
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.25)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {aiIsSpeaking ? (
                  <Volume2 size={28} color="#fff" />
                ) : (
                  <Mic size={28} color="#fff" />
                )}
              </div>
            </div>

            {/* Dynamic Status Label underneath sphere */}
            <div
              style={{
                position: 'absolute',
                bottom: '-45px',
                textAlign: 'center',
                width: '100%',
              }}
            >
              <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f3f4f6', letterSpacing: '0.02em' }}>
                {aiIsSpeaking ? 'Partnex Assistant Speaking...' : 'Listening to you...'}
              </p>
            </div>
          </div>

          {/* Live Subtitle Transcript overlay if available */}
          {liveTranscript && (
            <div
              style={{
                maxWidth: '560px',
                backgroundColor: 'rgba(18, 19, 22, 0.75)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '16px',
                padding: '0.85rem 1.25rem',
                textAlign: 'center',
                fontSize: '0.9rem',
                color: '#d1d5db',
                backdropFilter: 'blur(10px)',
                marginBottom: '2rem',
              }}
            >
              {liveTranscript}
            </div>
          )}

          {/* BOTTOM: END CALL BUTTON */}
          <div style={{ width: '100%', maxWidth: '360px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <button
              onClick={() => handleEndCall(true)}
              id="end-call-btn"
              style={{
                width: '100%',
                backgroundColor: 'var(--danger)',
                color: '#fff',
                border: 'none',
                borderRadius: '999px',
                padding: '1.15rem 2rem',
                fontSize: '1.1rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--danger)')}
            >
              <PhoneOff size={22} />
              <span>End Call</span>
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: CALL SUMMARY & TICKET CONFIRMATION */}
      {step === 'call_summary' && (
        <section
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem 1.5rem',
            width: '100%',
            maxWidth: '500px',
            margin: '0 auto',
            textAlign: 'center',
          }}
        >
          <div style={{ width: '100%' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '20px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.5rem',
                color: '#10b981',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#fff', marginBottom: '0.75rem' }}>
              Ticket Created Successfully
            </h2>

            <p style={{ fontSize: '1rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '2rem' }}>
              Thank you for connecting with Partnex. Your query and call details have been recorded.
              Our admin team will contact you on{' '}
              <strong style={{ color: '#fff' }}>{phone}</strong> shortly.
            </p>

            <button
              onClick={() => {
                setStep('phone_entry');
                setPhone('');
                setCallDuration(0);
                setLiveTranscript('');
              }}
              style={{
                width: '100%',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-active)',
                color: 'var(--cf-orange)',
                borderRadius: '16px',
                padding: '1rem',
                fontWeight: 700,
                fontSize: '1.05rem',
                cursor: 'pointer',
              }}
            >
              Start Another Call
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
