import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database stored in local directory
const dbPath = path.resolve(__dirname, '../data/partnex_calls.db');

// Ensure database initialized
let db;
try {
  db = new Database(dbPath);
  // Enable WAL mode for high concurrency & reliability
  db.pragma('journal_mode = WAL');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_sid TEXT UNIQUE,
      phone TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      duration_seconds INTEGER DEFAULT 0,
      query TEXT,
      transcription TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ SQLite database connected & table initialized at:', dbPath);
} catch (error) {
  console.error('❌ Failed to initialize SQLite database:', error);
}

export function saveTicket({ callSid, phone, status, durationSeconds, query, transcription }) {
  if (!db) return null;
  try {
    const stmt = db.prepare(`
      INSERT INTO tickets (call_sid, phone, status, duration_seconds, query, transcription)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(call_sid) DO UPDATE SET
        phone=excluded.phone,
        status=excluded.status,
        duration_seconds=excluded.duration_seconds,
        query=COALESCE(excluded.query, tickets.query),
        transcription=COALESCE(excluded.transcription, tickets.transcription)
    `);
    const info = stmt.run(callSid, phone, status, durationSeconds, query, transcription);
    console.log(`💾 Ticket saved to SQLite for ${phone}. Row ID: ${info.lastInsertRowid}`);
    return info.lastInsertRowid;
  } catch (err) {
    console.error('Error saving ticket to SQLite:', err);
    return null;
  }
}

export function getTickets(limit = 50) {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC LIMIT ?');
    return stmt.all(limit);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    return [];
  }
}

export default db;
