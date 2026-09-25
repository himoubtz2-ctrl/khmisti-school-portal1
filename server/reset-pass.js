// Utility: reset the admin password from the CLI.
// Usage: node reset-pass.js "NewPass1234"
import './env.js';
import { hashPassword, validPassword } from './security.js';
import { run, get } from './db.js';

const pw = process.argv[2];
if (!pw || !validPassword(pw)) {
  console.error('Usage: node reset-pass.js "NewPass1234!"  (min 10 chars, letter + digit)');
  process.exit(1);
}
const user = process.env.ADMIN_USER || 'khmisti';
const hash = await hashPassword(pw);
const existing = get('SELECT id FROM users WHERE username = ?', user);
if (existing) run('UPDATE users SET pass_hash = ? WHERE username = ?', hash, user);
else run('INSERT INTO users (username, pass_hash) VALUES (?, ?)', user, hash);
console.log(`Password updated for user "${user}".`);