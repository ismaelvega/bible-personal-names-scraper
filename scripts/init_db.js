const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../bible_names.db');
const db = new Database(dbPath, { verbose: console.log });

try {
  console.log('Creating tables...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_verses (
      id TEXT PRIMARY KEY,
      processed_at TEXT
    );
  `);
  console.log('processed_verses table ready.');

  db.exec(`
    CREATE TABLE IF NOT EXISTS extracted_names (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      type TEXT DEFAULT 'person',
      verse_reference TEXT,
      FOREIGN KEY(verse_reference) REFERENCES processed_verses(id)
    );
  `);
  console.log('extracted_names table ready.');

} catch (err) {
  console.error('Error initializing database:', err);
} finally {
  db.close();
  console.log('Database connection closed.');
}
