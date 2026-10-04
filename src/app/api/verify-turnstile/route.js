import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { token, phone } = await request.json();

    if (!token) {
      return NextResponse.json({ success: false, error: 'Cloudflare verification required.' }, { status: 400 });
    }

    if (!phone || phone.trim().length < 8) {
      return NextResponse.json({ success: false, error: 'Please enter a valid phone number.' }, { status: 400 });
    }

    const secretKey = process.env.CLOUDFLARE_SECRET_KEY;
    
    // If testing key or secret key is default test key, bypass or verify
    if (secretKey === '1x0000000000000000000000000000000AA' || token === 'XXXX.DUMMY.TOKEN.XXXX') {
      // Dummy test key always passes
      return NextResponse.json({ success: true, verified: true });
    }

    // Call Cloudflare Turnstile verify API
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);

    const cfResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const cfData = await cfResponse.json();

    if (!cfData.success) {
      console.warn('Cloudflare Turnstile verification failed:', cfData);
      return NextResponse.json({ success: false, error: 'Bot verification failed. Please try again.' }, { status: 403 });
    }

    return NextResponse.json({ success: true, verified: true });
  } catch (err) {
    console.error('Error verifying Cloudflare Turnstile:', err);
    return NextResponse.json({ success: false, error: 'Server validation error' }, { status: 500 });
  }
}
