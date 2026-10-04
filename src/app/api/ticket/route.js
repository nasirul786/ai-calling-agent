import { NextResponse } from 'next/server';
import { saveTicket, getTickets } from '../../../db.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { callSid, phone, status, durationSeconds, query, transcription } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: 'Phone number is required' }, { status: 400 });
    }

    const ticketId = saveTicket({
      callSid: callSid || `WEB-${Date.now()}`,
      phone,
      status: status || 'completed',
      durationSeconds: durationSeconds || 0,
      query: query || 'Software development inquiry',
      transcription: transcription || ''
    });

    return NextResponse.json({ success: true, ticketId });
  } catch (err) {
    console.error('Error saving ticket in route:', err);
    return NextResponse.json({ success: false, error: 'Failed to record ticket' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const tickets = getTickets(50);
    return NextResponse.json({ success: true, tickets });
  } catch (err) {
    return NextResponse.json({ success: false, error: 'Failed to fetch tickets' }, { status: 500 });
  }
}
