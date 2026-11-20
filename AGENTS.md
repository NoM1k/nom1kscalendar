# AGENTS.md — guide for AI assistants and developers

Read `README.md` first for setup, layout and the REST API.

## Conventions

- **UI language: English.** Code, comments and docs: English.
- **Backend:** Node.js 22.13+, ESM (`import`/`export`), Express routers in `backend/src/routes/`, one file per entity.
  Database access only via `node:sqlite` prepared statements (`db` from `db.js`; use `transaction()` for multi-statement writes) — never build SQL from user input.
- **Frontend:** plain HTML/CSS/JS, ES modules, **no build step, no framework**. One module per view in `frontend/js/`.
  Escape all user text before `innerHTML` (see `esc()` in `app.js`).
- **Theming:** never hard-code colors in CSS; use the variables in `:root` (palettes for light and dark are in `css/style.css`).
  Per-browser preferences go through `js/settings.js`.
- **Time:** store and transmit ISO 8601 UTC strings; convert to local time only for display.
- **JSON:** API fields are camelCase; DB columns are snake_case. Mapping happens in each route's `serialize`.
- **Live updates:** every route that mutates data must call `broadcast('<entity>')` from `live.js`.
- **Busy status:** derived (in a meeting now) OR manual override (`manualBusy`). Presence (`officeStatus`) is manual.

## Rules for changes

- Keep it simple and readable; prefer small modules over clever code.
- When you add or change an API endpoint, update the table in `README.md` and the header comment in the route file.
- Do not add dependencies without a clear reason.
- `.devpod/` is managed by the project owner — do not modify it.
- Never commit `backend/data/` or `node_modules/`.

## Testing

- Run `npm test` in `backend/` before and after backend changes. All tests must pass.
- New or changed endpoints need tests in `backend/test/api.test.js` (happy path + invalid input + 404).
- Tests start the real server with a temporary database via `test/helpers.js`; never point them at `backend/data/`.
- Test dates are in 2030 on purpose, so the relative demo data never interferes.
- The frontend has no automated tests; check UI changes in the browser (desktop and a ~375px wide viewport).
- Meetings, tasks and month cells must stay keyboard-accessible (`tabindex="0"`, `role="button"`; handled in `app.js`).

## Not yet implemented

Authentication, per-day office presence, recurring events, notifications, frontend tests.
