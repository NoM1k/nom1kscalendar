// Demo data, inserted only when the users table is empty.
// Dates are relative to "today" so the demo always looks current.
import { db } from './db.js';

function at(dayOffset, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n > 0) return;

  const addUser = db.prepare('INSERT INTO users (name, color, office_status) VALUES (?, ?, ?)');
  const alice = addUser.run('Alice Meier', '#4f6bed', 'office').lastInsertRowid;
  const ben = addUser.run('Ben Keller', '#e5484d', 'home').lastInsertRowid;
  const clara = addUser.run('Clara Frei', '#30a46c', 'office').lastInsertRowid;
  const dan = addUser.run('Dan Huber', '#f5a524', 'away').lastInsertRowid;

  const addEvent = db.prepare(
    'INSERT INTO events (title, start_time, end_time, location, organizer_id) VALUES (?, ?, ?, ?, ?)'
  );
  const addAttendee = db.prepare('INSERT OR IGNORE INTO event_attendees (event_id, user_id) VALUES (?, ?)');
  const event = (title, start, end, location, organizer, attendees) => {
    const id = addEvent.run(title, start, end, location, organizer).lastInsertRowid;
    for (const u of [organizer, ...attendees]) addAttendee.run(id, u);
  };

  event('Daily Stand-up', at(0, 9), at(0, 9, 15), 'Room 1', alice, [ben, clara]);
  event('Design Review', at(0, 10, 30), at(0, 12), 'Room 2', clara, [alice]);
  event('Sprint Planning', at(0, 14), at(0, 15, 30), 'Room 1', alice, [ben, clara, dan]);
  event('1:1 Ben / Alice', at(1, 11), at(1, 11, 30), 'Online', ben, [alice]);
  event('Team Lunch', at(2, 12), at(2, 13), 'Cafeteria', clara, [alice, ben, dan]);

  const addTask = db.prepare('INSERT INTO tasks (title, due, owner_id) VALUES (?, ?, ?)');
  addTask.run('Send weekly report', at(0, 17), alice);
  addTask.run('Prepare demo slides', at(1, 16), clara);
  addTask.run('Fix login bug', at(2, 12), ben);
  addTask.run('Submit expense report', at(3, 17), dan);
}
