// GET    /api/tasks?from=ISO&to=ISO&ownerId=N  -> tasks/deadlines due within range (all optional)
// POST   /api/tasks                            -> body: { title, due, ownerId }
// PUT    /api/tasks/:id                        -> body: { title?, due?, ownerId?, done? }
// DELETE /api/tasks/:id
import { Router } from 'express';
import { db } from '../db.js';
import { broadcast } from '../live.js';
import { toId, toIso } from '../util.js';

export const tasksRouter = Router();

const serialize = (r) => ({ id: r.id, title: r.title, due: r.due, ownerId: r.owner_id, done: !!r.done });
const userExists = (id) => !!id && !!db.prepare('SELECT 1 FROM users WHERE id = ?').get(id);

tasksRouter.get('/', (req, res) => {
  const from = req.query.from ? toIso(String(req.query.from)) : null;
  const to = req.query.to ? toIso(String(req.query.to)) : null;
  const ownerId = req.query.ownerId ? toId(req.query.ownerId) : null;
  if ((req.query.from && !from) || (req.query.to && !to) || (req.query.ownerId && !ownerId)) {
    return res.status(400).json({ error: 'Invalid from/to/ownerId' });
  }
  const rows = db
    .prepare('SELECT * FROM tasks WHERE (? IS NULL OR due >= ?) AND (? IS NULL OR due < ?) AND (? IS NULL OR owner_id = ?) ORDER BY due')
    .all(from, from, to, to, ownerId, ownerId);
  res.json(rows.map(serialize));
});

tasksRouter.post('/', (req, res) => {
  const { title, due, ownerId } = req.body ?? {};
  const cleanTitle = typeof title === 'string' ? title.trim() : '';
  const dueIso = toIso(due);
  if (!cleanTitle) return res.status(400).json({ error: 'title is required' });
  if (!dueIso) return res.status(400).json({ error: 'due must be a valid date' });
  if (!userExists(toId(ownerId))) return res.status(400).json({ error: 'ownerId must be an existing user' });
  const id = db.prepare('INSERT INTO tasks (title, due, owner_id) VALUES (?, ?, ?)').run(cleanTitle, dueIso, toId(ownerId)).lastInsertRowid;
  broadcast('tasks');
  res.status(201).json(serialize(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

tasksRouter.put('/:id', (req, res) => {
  const id = toId(req.params.id);
  const task = id && db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const body = req.body ?? {};
  const title = body.title === undefined ? task.title : String(body.title).trim();
  const due = body.due === undefined ? task.due : toIso(body.due);
  const ownerId = body.ownerId === undefined ? task.owner_id : toId(body.ownerId);
  const done = body.done === undefined ? task.done : body.done ? 1 : 0;
  if (!title) return res.status(400).json({ error: 'title must not be empty' });
  if (!due) return res.status(400).json({ error: 'due must be a valid date' });
  if (!userExists(ownerId)) return res.status(400).json({ error: 'ownerId must be an existing user' });

  db.prepare('UPDATE tasks SET title = ?, due = ?, owner_id = ?, done = ? WHERE id = ?').run(title, due, ownerId, done, id);
  broadcast('tasks');
  res.json(serialize(db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)));
});

tasksRouter.delete('/:id', (req, res) => {
  const id = toId(req.params.id);
  const result = id ? db.prepare('DELETE FROM tasks WHERE id = ?').run(id) : { changes: 0 };
  if (!result.changes) return res.status(404).json({ error: 'Task not found' });
  broadcast('tasks');
  res.status(204).end();
});
