// GET    /api/events?from=ISO&to=ISO   -> events overlapping the range (both optional)
// POST   /api/events                   -> body: { title, start, end, location?, organizerId, attendeeIds? }
// PUT    /api/events/:id               -> same body as POST
// DELETE /api/events/:id
import { Router } from 'express';
import { db, transaction } from '../db.js';
import { broadcast } from '../live.js';
import { toId, toIso } from '../util.js';

export const eventsRouter = Router();

const attendeesStmt = db.prepare('SELECT user_id FROM event_attendees WHERE event_id = ?');

function serialize(row) {
  return {
    id: row.id,
    title: row.title,
    start: row.start_time,
    end: row.end_time,
    location: row.location,
    organizerId: row.organizer_id,
    attendeeIds: attendeesStmt.all(row.id).map((a) => a.user_id),
  };
}

/** Validate a request body. Returns { error } or { value }. */
function parseBody(body = {}) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const start = toIso(body.start);
  const end = toIso(body.end);
  const organizerId = toId(body.organizerId);
  if (!title) return { error: 'title is required' };
  if (!start || !end) return { error: 'start and end must be valid dates' };
  if (end <= start) return { error: 'end must be after start' };
  if (!organizerId || !db.prepare('SELECT 1 FROM users WHERE id = ?').get(organizerId)) {
    return { error: 'organizerId must be an existing user' };
  }
  const ids = Array.isArray(body.attendeeIds) ? body.attendeeIds.map(toId).filter(Boolean) : [];
  const attendeeIds = [...new Set([organizerId, ...ids])].filter((id) =>
    db.prepare('SELECT 1 FROM users WHERE id = ?').get(id)
  );
  const location = typeof body.location === 'string' ? body.location.trim() : '';
  return { value: { title, start, end, location, organizerId, attendeeIds } };
}

const saveAttendees = transaction((eventId, attendeeIds) => {
  db.prepare('DELETE FROM event_attendees WHERE event_id = ?').run(eventId);
  const add = db.prepare('INSERT INTO event_attendees (event_id, user_id) VALUES (?, ?)');
  for (const id of attendeeIds) add.run(eventId, id);
});

eventsRouter.get('/', (req, res) => {
  const from = req.query.from ? toIso(String(req.query.from)) : null;
  const to = req.query.to ? toIso(String(req.query.to)) : null;
  if ((req.query.from && !from) || (req.query.to && !to)) {
    return res.status(400).json({ error: 'from/to must be valid dates' });
  }
  const rows = db
    .prepare('SELECT * FROM events WHERE (? IS NULL OR end_time > ?) AND (? IS NULL OR start_time < ?) ORDER BY start_time')
    .all(from, from, to, to);
  res.json(rows.map(serialize));
});

eventsRouter.post('/', (req, res) => {
  const { error, value } = parseBody(req.body);
  if (error) return res.status(400).json({ error });
  const id = db
    .prepare('INSERT INTO events (title, start_time, end_time, location, organizer_id) VALUES (?, ?, ?, ?, ?)')
    .run(value.title, value.start, value.end, value.location, value.organizerId).lastInsertRowid;
  saveAttendees(id, value.attendeeIds);
  broadcast('events');
  res.status(201).json(serialize(db.prepare('SELECT * FROM events WHERE id = ?').get(id)));
});

eventsRouter.put('/:id', (req, res) => {
  const id = toId(req.params.id);
  if (!id || !db.prepare('SELECT 1 FROM events WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const { error, value } = parseBody(req.body);
  if (error) return res.status(400).json({ error });
  db.prepare('UPDATE events SET title = ?, start_time = ?, end_time = ?, location = ?, organizer_id = ? WHERE id = ?').run(
    value.title, value.start, value.end, value.location, value.organizerId, id
  );
  saveAttendees(id, value.attendeeIds);
  broadcast('events');
  res.json(serialize(db.prepare('SELECT * FROM events WHERE id = ?').get(id)));
});

eventsRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  const result = id ? db.prepare('DELETE FROM events WHERE id = ?').run(id) : { changes: 0 };
  if (!result.changes) return res.status(404).json({ error: 'Event not found' });
  broadcast('events');
  res.status(204).end();
});
