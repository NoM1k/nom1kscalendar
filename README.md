# Arbeitskalender

A web-based team calendar inspired by Microsoft Teams, with more transparency:
see colleagues' meetings, tasks/deadlines, busy/free status and office presence
*before* scheduling a meeting. Changes appear live for all users.

## Quick start

Requires Node.js 22.13+ (uses the built-in `node:sqlite`).

```bash
cd backend
npm install
npm start
```

Open http://localhost:3000. Demo data (4 users, events, tasks) is created on first start.
Use `npm run dev` for auto-restart on changes. To reset the data, delete `backend/data/`.

## Tests

```bash
cd backend
npm test
```

API tests use the built-in `node:test` runner. They start the real server on a free port with a temporary
database (see `backend/test/helpers.js`), so your data in `backend/data/` is never touched. They cover users,
events, tasks, availability, error cases and the WebSocket "changed" message. The frontend has no automated tests yet.

## Stack

- **Backend:** Node.js, Express, built-in `node:sqlite` (SQLite file in `backend/data/`), `ws` (WebSocket)
- **Frontend:** plain HTML / CSS / JavaScript (ES modules), no build step. Served by the backend.
- **No login** (for now): the UI lets you pick which user you are.

## Project layout

```
backend/src/
  server.js          Express app, static frontend, WebSocket attach
  db.js              SQLite connection + schema
  seed.js            Demo data (only if DB is empty)
  live.js            WebSocket broadcast ("changed" messages)
  util.js            Date/id helpers
  routes/            users.js, events.js, tasks.js, availability.js
backend/test/        helpers.js (starts the server for tests), api.test.js
frontend/
  index.html
  css/style.css
  js/app.js          App shell: state, navigation, data loading, live updates
  js/api.js          REST client
  js/util.js         Escaping + date helpers (weeks start on Monday)
  js/settings.js     Per-browser preferences (localStorage, "ak.*" keys)
  js/theme.js        Light/dark theme toggle (follows OS until the user chooses)
  js/team.js         Team status strip (busy/free + office presence)
  js/meeting-dialog.js  Create/edit/delete meetings with live availability check
  js/task-dialog.js     Create/edit/complete/delete tasks and deadlines
  js/status.js       "My status" controls (office/home/away + do not disturb)
  js/views/week.js   Week view (time grid, deadlines row, now line); also renders the day view (1 column)
  js/views/day.js    Day view = week view with one wide, detailed column
  js/views/month.js  Month view (calendar grid, meetings + deadlines per day)
  js/views/team.js   Team view (one row per person, horizontal day timeline)
```

## REST API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/users` | All users with `officeStatus`, `manualBusy`, `inMeeting`, `busyNow` |
| PUT | `/api/users/:id/status` | `{ officeStatus?: "office"\|"home"\|"away", manualBusy?: boolean }` |
| GET | `/api/events?from&to` | Events overlapping the range (ISO dates) |
| POST / PUT / DELETE | `/api/events[/:id]` | `{ title, start, end, location?, organizerId, attendeeIds? }` |
| GET | `/api/tasks?from&to&ownerId` | Tasks/deadlines |
| POST / PUT / DELETE | `/api/tasks[/:id]` | `{ title, due, ownerId, done? }` |
| GET | `/api/availability?start&end[&userIds=1,2][&exclude=EVENT_ID]` | Free/busy + conflicts per user |

## Live updates

WebSocket at `/ws`. After every change the server broadcasts
`{ "type": "changed", "entity": "users" | "events" | "tasks" }`; clients re-fetch via REST.

## Roadmap

1. ~~Scaffold: backend, DB, demo data, app shell~~
2. ~~Week view with meetings and tasks~~ (date navigation, "calendar of" person selector, zoom 32–144 px/hour via +/− or Ctrl+wheel, dark mode)
3. ~~Status controls + team overview timeline~~ ("I am" selector, Week | Team switch, day navigation)
4. ~~"Create meeting" form with live availability check~~ (click a free slot or an event, or "+ New meeting")
5. ~~Day and month views~~ (Day | Week | Month | Team switch; month cell click opens the day)
6. ~~Tasks/deadlines form~~ ("+ New task", click a deadline chip to edit/complete/delete, click the "Due" row to add)
7. ~~Polish~~: backend tests, connection banner, multi-day meetings in the form, keyboard access, mobile layout
8. Ideas: per-day office presence, recurring events, notifications, login, frontend tests
