# Web Call Agent (Google Gemini 3.8 Live API + SQLite + Next.js)

A real-time AI Web Calling agent built with **Next.js 16**, **Google Gemini 3.8 Live API** (`models/gemini-3.8-live` with `Autonoe` voice), **Cloudflare Turnstile**, and a local **SQLite database** (`better-sqlite3`).

Users open the web call link from any mobile browser or desktop, enter their phone number on a clean page, and immediately speak with the Partnex AI support assistant in real time.

---

## Features

- **Google Gemini 3.8 Live Voice**: Live bidirectional audio streaming using `@google/genai` Live API (`models/gemini-3.8-live`) with the **Autonoe** voice.
- **Microphone Permissions Upfront**: Browser requests mic access upon page load and maintains an active audio stream for zero-delay calling.
- **Ultra-Clean UI (Cloudflare Orange Theme)**:
  - Simple phone entry asking: *"What is your phone number?"* (No extra cards or cluttered header banners).
  - Center pulsing, spinning audio visual sphere with live waveform beats.
  - Strict **2-minute hard cap** call timer and prominent **End Call** button.
- **Partnex Support Knowledge**:
  - Informs callers that Partnex creates **every type of website** (custom web portals, SaaS, e-commerce, AI web apps).
  - Clarifies that **pricing can be viewed on the website or discussed directly with a team member**.
  - Collects caller query, logs a ticket into SQLite, and announces:
    > *"Got it! I have noted your requirement and raised a ticket for you. Our admin team will contact you shortly on your number. Have a wonderful day!"*
- **SQLite Database Persistence**:
  - Stores `phone`, `call_sid`, `status`, `duration_seconds`, `query`, and `transcription` into `data/partnex_calls.db`.
  - Database folder and files are completely ignored in Git.
- **Cloudflare Turnstile**: Zero-friction bot protection verifying caller tokens prior to session initiation.

---

## Architecture Flow

```
[User Browser (Mobile / Desktop)]
       │
       │ 1. Phone number entered + Cloudflare Turnstile token validated
       ▼
[Next.js Server (:3000)]
       │
       │ 2. Initiates bi-directional audio WebSocket (/api/call-stream)
       ▼
[Google Gemini 3.8 Live API (models/gemini-3.8-live, Voice: Autonoe)]
       │
       │ 3. Realtime voice dialogue & user requirement capture
       ▼
[SQLite Database (partnex_calls.db)]
       │ (Saves: phone, duration, transcript, query)
       ▼
[Gemini Spoken Response]: "Got it! I have raised a ticket. Our admin team will contact you shortly."
```

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set your Google Gemini API key:
```ini
PORT=3000

# Google Gemini API Key from https://aistudio.google.com/app/apikey
GEMINI_API_KEY=AIzaSy...your_gemini_api_key_here
GEMINI_LIVE_MODEL=models/gemini-3.8-live
GEMINI_VOICE_NAME=Autonoe

# Cloudflare Turnstile (Pre-configured with test keys)
NEXT_PUBLIC_CLOUDFLARE_SITE_KEY=1x00000000000000000000AA
CLOUDFLARE_SECRET_KEY=1x0000000000000000000000000000000AA
```

### 3. Run the Server
```bash
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your mobile or desktop browser.

---

## Checking Saved Tickets

Fetch all recorded tickets anytime:
```bash
curl http://localhost:3000/api/ticket
```
Or run the automated database verification script:
```bash
node test-db.js
```

---

## License
MIT
