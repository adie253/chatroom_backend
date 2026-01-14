const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'chat.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database', err);
  } else {
    console.log('Connected to SQLite database.');
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT,
      content TEXT,
      timestamp INTEGER,
      seen INTEGER DEFAULT 0
    )`, (err) => {
      if (!err) {
        // Migration: Check if 'seen' column exists, if not add it
        db.all("PRAGMA table_info(messages)", (err, columns) => {
          if (!err) {
            const hasSeen = columns.some(col => col.name === 'seen');
            if (!hasSeen) {
              console.log("Migrating database: adding 'seen' column...");
              db.run("ALTER TABLE messages ADD COLUMN seen INTEGER DEFAULT 0");
            }
          }
        });
      }
    });
  }
});

function saveMessage(sender, content) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT INTO messages (sender, content, timestamp, seen) VALUES (?, ?, ?, 0)');
    const timestamp = Date.now();
    stmt.run(sender, content, timestamp, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, sender, content, timestamp, seen: 0 });
    });
    stmt.finalize();
  });
}

function getMessages(limit = 50) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM messages ORDER BY timestamp ASC', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function clearMessages() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM messages', [], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function markMessagesAsSeen(senderToMarkAsSeen) {
  // When User A sees messages from User B:
  // We update messages WHERE sender = 'User B' AND seen = 0
  return new Promise((resolve, reject) => {
    db.run('UPDATE messages SET seen = 1 WHERE sender = ? AND seen = 0', [senderToMarkAsSeen], function (err) {
      if (err) reject(err);
      else resolve(this.changes);
    });
  });
}

module.exports = { db, saveMessage, getMessages, clearMessages, markMessagesAsSeen };
