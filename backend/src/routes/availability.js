// GET /api/availability?start=ISO&end=ISO[&userIds=1,2,3][&exclude=EVENT_ID]
// For each user: office status, whether they are free for the whole range, and the conflicting events.
// `exclude` ignores one event (the meeting currently being edited). Used by the meeting form to warn before scheduling.
import { Router } from 'express';
import { db } from '../db.js';
import { toId, toIso } from '../util.js';

export const availabilityRouter = Router();

const conflictsStmt = db.prepare(`
  SELECT e.id, e.title, e.start_time, e.end_time FROM events e
  JOIN event_attendees a ON a.event_id = e.id
  WHERE a.user_id = ? AND e.start_time < ? AND e.end_time > ? AND e.id != ?
  ORDER BY e.start_time
`);

availabilityRouter.get('/', (req, res) => {
  const start = toIso(String(req.query.start ?? ''));
  const end = toIso(String(req.query.end ?? ''));
  if (!start || !end || end <= start) {
    return res.status(400).json({ error: 'start and end must be valid dates, end after start' });
  }
  const exclude = toId(req.query.exclude) ?? 0; // 0 matches no event
  const wanted = req.query.userIds
    ? String(req.query.userIds).split(',').map(toId).filter(Boolean)
    : null;

  const users = db.prepare('SELECT * FROM users ORDER BY name').all().filter((u) => !wanted || wanted.includes(u.id));
  res.json(
    users.map((u) => {
      const conflicts = conflictsStmt.all(u.id, end, start, exclude).map((c) => ({
        id: c.id, title: c.title, start: c.start_time, end: c.end_time,
      }));
      const manualBusy = !!u.manual_busy;
      return {
        userId: u.id,
        name: u.name,
        officeStatus: u.office_status,
        manualBusy,
        free: conflicts.length === 0 && !manualBusy,
        conflicts,
      };
    })
  );
});
