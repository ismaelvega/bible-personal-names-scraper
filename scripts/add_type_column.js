const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, '../bible_names.db');
const db = new Database(dbPath);

try {
  db.exec('ALTER TABLE extracted_names ADD COLUMN type TEXT DEFAULT "person"');
  console.log('Column "type" added successfully');
} catch (e) {
  if (e.message.includes('duplicate column')) {
    console.log('Column "type" already exists');
  } else {
    throw e;
  }
} finally {
  db.close();
}
