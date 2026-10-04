# Web Call Agent (OpenAI Realtime API + SQLite + Next.js)

A real-time AI Web Calling agent built with **Next.js 14**, **OpenAI Realtime API** (`gpt-4o-realtime-preview`), **Cloudflare Turnstile**, and a local **SQLite database** (`better-sqlite3`).

Users can open the web link from any mobile browser or desktop, enter their phone number through a clean verification page, and immediately speak with the AI support assistant via low-latency bidirectional WebSockets.

---

## Features

- **Instant Web Voice Calling**: No telephony number or telecom paperwork required. Callers talk directly from their phone/desktop browser using Web Audio & WebSockets.
- **Ultra-low Latency AI Speech**: Powered by OpenAI Realtime API (`gpt-4o-realtime-preview`) with customizable `OPENAI_BASE_URL`.
- **Cloudflare Orange Themed UI**:
  - **Phone Entry Screen**: Clean interface asking *"What is your phone number?"* with bot validation.
  - **Live In-Call Screen**: Center pulsating, spinning audio visual sphere with real-time waveform beats.
  - **Call Controls**: Top live timer with a strict **2-minute hard limit**, and a bottom **End Call** button.
- **Partnex Support Assistant Knowledge**:
  - Provides software development services support.
  - Clarifies that Partnex creates **every type of website** (custom web portals, SaaS, e-commerce, AI integrations).
  - Clarifies that **pricing can be viewed on the website or discussed directly with a team member**.
  - Collects caller query, logs a ticket, and states:
    > *"Got it! I have raised a ticket for your request, our admins/team will contact you shortly."*
- **SQLite Database Persistence**:
  - Automatically records `phone`, `call_sid`, `status`, `duration_seconds`, `query`, and `transcription` into SQLite (`data/partnex_calls.db`).
  - Database files are completely ignored in Git.
- **Cloudflare Turnstile Bot Protection**: Integrates Cloudflare site key & secret key token verification.

---

## Architecture Flow

```
[User Browser (Mobile / Desktop)]
       │
       │ 1. Phone number entered + Cloudflare Turnstile token verified
       ▼
[Next.js Server (:3000)]
       │
       │ 2. Initiates bi-directional audio WebSocket (/api/call-stream)
       ▼
[OpenAI Realtime API (gpt-4o-realtime-preview)]
       │
       │ 3. Voice conversation & function calling (raise_support_ticket)
       ▼
[SQLite Database (partnex_calls.db)]
       │ (Saves: phone, duration, transcript, query)
       ▼
[AI Response]: "Got it! I have raised a ticket. Our admin team will contact you."
```

---

## Tech Stack

- **Framework**: Next.js 14 (App Router) + React 18
- **Backend / WebSockets**: Node.js + `ws`
- **Database**: SQLite with `better-sqlite3` (WAL mode enabled)
- **AI Voice**: OpenAI Realtime API (WebSocket audio streaming)
- **Security**: Cloudflare Turnstile (`siteverify`)
- **Icons & Styling**: Vanilla CSS + `lucide-react`

---

## Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/web-call-agent.git
cd web-call-agent
```

### 2. Install dependencies
```bash
npm install
```

### 3. Setup Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your `.env` values:
```ini
PORT=3000
SERVER_DOMAIN=localhost:3000

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview

# Cloudflare Turnstile
NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=1x00000000000000000000AA
CLOUDFLARE_SECRET_KEY=1x0000000000000000000000000000000AA
```
*(The default keys are Cloudflare's official testing keys which automatically pass for local development).*

### 4. Run the development server
```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## Checking Saved Tickets

You can view recorded tickets anytime through the API:
```bash
curl http://localhost:3000/api/ticket
```
Or run the automated test:
```bash
node test-api.js
```

---

## License
MIT
