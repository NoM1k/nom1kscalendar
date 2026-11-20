// SQLite database: connection + schema.
// All timestamps are stored as ISO 8601 UTC strings (e.g. "2026-11-18T09:00:00.000Z").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Driver: the SQLite built into Node 22.13+ (no native build needed), otherwise `better-sqlite3`
// (an optional dependency with prebuilt binaries for Node 20). Both offer the same small API we use:
// exec(), prepare().run/get/all(). Do not use driver-specific features elsewhere.
async function loadDriver() {
  try {
    return (await import('node:sqlite')).DatabaseSync;
  } catch {
    // Not available (Node < 22.13): fall through to better-sqlite3.
  }
  try {
    return (await import('better-sqlite3')).default;
  } catch {
    throw new Error(
      `No SQLite driver available on Node ${process.versions.node}. ` +
        'Use Node.js 22.13+ (built-in node:sqlite), or run "npm install" in backend/ so that the optional ' +
        'dependency better-sqlite3 is installed (supports Node 20).'
    );
  }
}
const Database = await loadDriver();

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(process.env.DB_FILE || path.join(dataDir, 'calendar.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/** Wrap a function so all its statements run in one transaction (works the same with both drivers). */
export function transaction(fn) {
  return (...args) => {
    db.exec('BEGIN');
    try {
      const result = fn(...args);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };
}

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    color         TEXT NOT NULL DEFAULT '#4f6bed',
    office_status TEXT NOT NULL DEFAULT 'office' CHECK (office_status IN ('office','home','away')),
    manual_busy   INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    start_time   TEXT NOT NULL,
    end_time     TEXT NOT NULL,
    location     TEXT NOT NULL DEFAULT '',
    organizer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS event_attendees (
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
    PRIMARY KEY (event_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL,
    due      TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    done     INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time, end_time);
  CREATE INDEX IF NOT EXISTS idx_tasks_due   ON tasks(due);
`);
