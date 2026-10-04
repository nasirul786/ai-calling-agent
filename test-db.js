import { saveTicket, getTickets } from './src/db.js';

console.log('🧪 Testing SQLite ticket persistence...');

const testPhone = '+91 9876543210';
const rowId = saveTicket({
  callSid: `TEST-${Date.now()}`,
  phone: testPhone,
  status: 'completed',
  durationSeconds: 45,
  query: 'Client wants an eCommerce website for fashion brand with payment gateway',
  transcription: 'User: We need a fashion ecommerce website.\nAssistant: Partnex creates all kinds of websites. Raised a ticket.'
});

console.log(`✅ Saved ticket with ID: ${rowId}`);

const allTickets = getTickets(5);
console.log('📋 Recent tickets in SQLite database:', JSON.stringify(allTickets, null, 2));

if (allTickets.length > 0) {
  console.log('🎉 SQLite verification test passed successfully!');
  process.exit(0);
} else {
  console.error('❌ Failed to retrieve tickets.');
  process.exit(1);
}
