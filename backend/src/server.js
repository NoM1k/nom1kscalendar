// Entry point: Express (REST API + static frontend) and WebSocket live updates.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './db.js';
import { seedIfEmpty } from './seed.js';
import { attachLive } from './live.js';
import { usersRouter } from './routes/users.js';
import { eventsRouter } from './routes/events.js';
import { tasksRouter } from './routes/tasks.js';
import { availabilityRouter } from './routes/availability.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(here, '..', '..', 'frontend');
const PORT = Number(process.env.PORT) || 3000;

seedIfEmpty();

const app = express();
app.use(express.json());

app.use('/api/users', usersRouter);
app.use('/api/events', eventsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.use(express.static(frontendDir));

// Last-resort error handler (e.g. malformed JSON bodies).
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status ? 'Bad request' : 'Internal server error' });
});

const server = http.createServer(app);
attachLive(server);

// Listen on all interfaces so the app is reachable from outside a DevPod/container.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arbeitskalender running on http://localhost:${PORT}`);
});
