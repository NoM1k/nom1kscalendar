// GET  /api/users                 -> all users incl. derived `busyNow`
// PUT  /api/users/:id/status      -> body: { officeStatus?: 'office'|'home'|'away', manualBusy?: boolean }
import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../live.js';
import { toId } from '../util.js';

export const usersRouter = Router();

const OFFICE_STATUSES = ['office', 'home', 'away'];

const busyNowStmt = db.prepare(`
  SELECT 1 FROM events e
  JOIN event_attendees a ON a.event_id = e.id
  WHERE a.user_id = ? AND e.start_time <= ? AND e.end_time > ?
  LIMIT 1
`);

function serializeUser(row, nowIso = new Date().toISOString()) {
  const inMeeting = !!busyNowStmt.get(row.id, nowIso, nowIso);
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    officeStatus: row.office_status,
    manualBusy: !!row.manual_busy,
    inMeeting,
    busyNow: inMeeting || !!row.manual_busy,
  };
}

usersRouter.get('/', (_req, res) => {
  const now = new Date().toISOString();
  const rows = db.prepare('SELECT * FROM users ORDER BY name').all();
  res.json(rows.map((r) => serializeUser(r, now)));
});

usersRouter.put('/:id/status', (req, res) => {
  const id = toId(req.params.id);
  const user = id && db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { officeStatus, manualBusy } = req.body ?? {};
  if (officeStatus !== undefined && !OFFICE_STATUSES.includes(officeStatus)) {
    return res.status(400).json({ error: `officeStatus must be one of: ${OFFICE_STATUSES.join(', ')}` });
  }
  if (manualBusy !== undefined && typeof manualBusy !== 'boolean') {
    return res.status(400).json({ error: 'manualBusy must be a boolean' });
  }

  db.prepare('UPDATE users SET office_status = ?, manual_busy = ? WHERE id = ?').run(
    officeStatus ?? user.office_status,
    manualBusy === undefined ? user.manual_busy : manualBusy ? 1 : 0,
    id
  );
  broadcast('users');
  res.json(serializeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)));
});
