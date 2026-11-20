// App shell: state, navigation, view switching, zoom, data loading and live updates.
// Views live in js/views/, one module per view (day, week, month, team).
import { api } from './api.js';
import { loadSetting, saveSetting } from './settings.js';
import { initTheme } from './theme.js';
import { initStatus } from './status.js';
import { renderTeam } from './team.js';
import { initMeetingDialog } from './meeting-dialog.js';
import { initTaskDialog } from './task-dialog.js';
import { DEFAULT_ZOOM, GRID_START_HOUR, ZOOM_LEVELS, renderWeek } from './views/week.js';
import { renderDay } from './views/day.js';
import { renderMonth } from './views/month.js';
import { TEAM_LABEL_PX, hourWidth, renderTeamView } from './views/team.js';
import { addDays, esc, fmtDayMonth, fromDateInput, startOfDay, startOfWeek, toDateInput } from './util.js';

const $ = (selector) => document.querySelector(selector);

// ---- state -----------------------------------------------------------------
const VIEWS = ['day', 'week', 'month', 'team'];
const savedView = loadSetting('view', 'week');

const state = {
  view: VIEWS.includes(savedView) ? savedView : 'week',
  date: startOfDay(new Date()), // the day shown (day/team), or any day inside the shown week/month
  userId: loadSetting('userId', 'all'), // "Calendar of": 'all' or a user id
  meId: loadSetting('meId', null), // "I am": a user id (no login yet)
  zoom: Math.min(Math.max(Number(loadSetting('zoom', DEFAULT_ZOOM)) || 0, 0), ZOOM_LEVELS.length - 1),
  users: [],
  data: { events: [], tasks: [] }, // last loaded data, so zooming/filtering can re-render without fetching
};

/** The time range the current view needs: one day, a week, or the month grid (full weeks). */
function currentRange() {
  switch (state.view) {
    case 'week': {
      const from = startOfWeek(state.date);
      return { from, to: addDays(from, 7) };
    }
    case 'month': {
      const first = new Date(state.date.getFullYear(), state.date.getMonth(), 1);
      const last = new Date(state.date.getFullYear(), state.date.getMonth() + 1, 0);
      return { from: startOfWeek(first), to: addDays(startOfWeek(last), 7) };
    }
    default: {
      // 'day' and 'team'
      const from = startOfDay(state.date);
      return { from, to: addDays(from, 1) };
    }
  }
}

// ---- connection problems ---------------------------------------------------
// A banner under the header lists what is currently wrong ('data' = REST loading failed, 'live' = no WebSocket).
const problems = new Map();
function setProblem(key, message) {
  if (message) problems.set(key, message);
  else problems.delete(key);
  const banner = $('#banner');
  banner.textContent = [...problems.values()].join(' ');
  banner.hidden = problems.size === 0;
}

// ---- rendering -------------------------------------------------------------
const userOptions = (users) => users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');

function rangeLabel(from) {
  if (state.view === 'week') {
    const end = addDays(from, 6);
    return `${fmtDayMonth(from)} – ${fmtDayMonth(end)} ${end.getFullYear()}`;
  }
  if (state.view === 'month') return state.date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return from.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function renderToolbar() {
  const { from } = currentRange();
  const unit = { day: 'day', week: 'week', month: 'month', team: 'day' }[state.view];
  $('#range-label').textContent = rangeLabel(from);
  $('#date-picker').value = toDateInput(state.date);
  $('#prev').setAttribute('aria-label', `Previous ${unit}`);
  $('#next').setAttribute('aria-label', `Next ${unit}`);

  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.view === state.view));

  const timeGrid = state.view === 'day' || state.view === 'week'; // vertical time grid (week.js)
  $('#team').hidden = !timeGrid; // the other views show the same info themselves
  $('#week').hidden = !timeGrid;
  $('#month').hidden = state.view !== 'month';
  $('#team-view').hidden = state.view !== 'team';
  $('#calendar-of').hidden = state.view === 'team'; // the team view always shows everyone
}

let renderedUsersKey = '';
function renderUserSelects() {
  // Only rebuild the <option>s when the user list changed, so an open dropdown is not closed by live updates.
  const key = state.users.map((u) => `${u.id}:${u.name}`).join('|');
  const calendar = $('#user-select');
  const me = $('#me-select');
  if (key !== renderedUsersKey) {
    renderedUsersKey = key;
    calendar.innerHTML = `<option value="all">Everyone</option>${userOptions(state.users)}`;
    me.innerHTML = userOptions(state.users);
  }
  // "Calendar of"
  calendar.value = String(state.userId);
  if (calendar.value !== String(state.userId)) {
    state.userId = 'all'; // saved user no longer exists
    calendar.value = 'all';
  }
  // "I am": default to the first user if nothing (valid) is saved.
  if (!state.users.some((u) => u.id === state.meId)) state.meId = state.users[0]?.id ?? null;
  me.value = String(state.meId ?? '');
}

function renderZoomControls() {
  const noZoom = state.view === 'month'; // the month grid has no time axis
  $('#zoom-label').textContent = noZoom ? '–' : `${Math.round((ZOOM_LEVELS[state.zoom] / ZOOM_LEVELS[DEFAULT_ZOOM]) * 100)}%`;
  $('#zoom-out').disabled = noZoom || state.zoom === 0;
  $('#zoom-in').disabled = noZoom || state.zoom === ZOOM_LEVELS.length - 1;
}

function drawView() {
  const { from, to } = currentRange();
  const common = { events: state.data.events, tasks: state.data.tasks, users: state.users, userId: state.userId };
  switch (state.view) {
    case 'day':
      return renderDay($('#week'), { ...common, day: from, zoom: state.zoom });
    case 'week':
      return renderWeek($('#week'), { ...common, weekStart: from, zoom: state.zoom });
    case 'month':
      return renderMonth($('#month'), { ...common, rangeStart: from, rangeEnd: to, month: state.date });
    case 'team':
      return renderTeamView($('#team-view'), {
        day: from, events: state.data.events, users: state.users, meId: state.meId, zoom: state.zoom,
      });
  }
}

const status = initStatus(
  { office: $('#office-select'), dnd: $('#dnd') },
  () => state.meId,
  () => refresh()
);

const meetings = initMeetingDialog({
  getUsers: () => state.users,
  getMeId: () => state.meId,
  onChanged: () => refresh(),
});

const taskDialog = initTaskDialog({
  getUsers: () => state.users,
  getMeId: () => state.meId,
  onChanged: () => refresh(),
});

let refreshing = false;
async function refresh() {
  if (refreshing) return; // avoid overlapping runs when many live messages arrive
  refreshing = true;
  try {
    const { from, to } = currentRange();
    const [users, events, tasks] = await Promise.all([
      api.users(),
      api.events(from.toISOString(), to.toISOString()),
      api.tasks(from.toISOString(), to.toISOString()),
    ]);
    state.users = users;
    state.data = { events, tasks };
    renderUserSelects();
    renderToolbar();
    renderZoomControls();
    status.render(users.find((u) => u.id === state.meId));
    renderTeam($('#team'), users);
    drawView();
    setProblem('data', null);
  } catch (err) {
    console.error(err);
    setProblem('data', 'Could not load data from the server. Retrying…');
    setTimeout(refresh, 5000);
  } finally {
    refreshing = false;
  }
}

// ---- zoom ------------------------------------------------------------------
/**
 * Change the zoom level by `delta` steps and keep the time under the pointer (default: the middle of the
 * view) in place. Day/week zoom vertically (hour height), the team view horizontally (hour width).
 */
function changeZoom(delta, pointer) {
  if (state.view === 'month') return;
  const next = Math.min(Math.max(state.zoom + delta, 0), ZOOM_LEVELS.length - 1);
  if (next === state.zoom) return;

  const horizontal = state.view === 'team';
  const selector = horizontal ? '#team-view .tv-scroll' : '#week .week-body';
  const unit = (zoom) => (horizontal ? hourWidth(zoom) : ZOOM_LEVELS[zoom]); // px per hour
  const lead = horizontal ? TEAM_LABEL_PX : 0; // sticky name column in front of the timeline

  const scroller = $(selector);
  let offset = 0;
  let hoursAtAnchor = 0;
  if (scroller) {
    const rect = scroller.getBoundingClientRect();
    const size = horizontal ? scroller.clientWidth : scroller.clientHeight;
    offset = pointer ? (horizontal ? pointer.x - rect.left : pointer.y - rect.top) : size / 2;
    const scroll = horizontal ? scroller.scrollLeft : scroller.scrollTop;
    hoursAtAnchor = (scroll + offset - lead) / unit(state.zoom);
  }

  state.zoom = next;
  saveSetting('zoom', next);
  renderZoomControls();
  drawView();

  const updated = $(selector);
  if (updated && scroller) {
    const target = hoursAtAnchor * unit(next) - offset + lead;
    if (horizontal) updated.scrollLeft = target;
    else updated.scrollTop = target;
  }
}

$('#zoom-in').addEventListener('click', () => changeZoom(1));
$('#zoom-out').addEventListener('click', () => changeZoom(-1));

// Ctrl + mouse wheel (also pinch on trackpads) zooms the timeline instead of the whole page.
let wheelAccumulator = 0;
$('main').addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey || state.view === 'month') return; // month: leave the browser's own zoom alone
    e.preventDefault();
    wheelAccumulator += e.deltaY;
    if (Math.abs(wheelAccumulator) < 40) return; // one step per "notch", not per event
    changeZoom(wheelAccumulator < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
    wheelAccumulator = 0;
  },
  { passive: false }
);

// ---- navigation ------------------------------------------------------------
function shift(direction) {
  if (state.view === 'month') {
    state.date = new Date(state.date.getFullYear(), state.date.getMonth() + direction, 1);
  } else {
    state.date = addDays(state.date, direction * (state.view === 'week' ? 7 : 1));
  }
  refresh();
}
$('#prev').addEventListener('click', () => shift(-1));
$('#next').addEventListener('click', () => shift(1));
$('#today-btn').addEventListener('click', () => {
  state.date = startOfDay(new Date());
  refresh();
});
$('#date-picker').addEventListener('change', (e) => {
  if (!e.target.value) return;
  state.date = fromDateInput(e.target.value);
  refresh();
});

function setView(view) {
  if (state.view === view) return;
  state.view = view;
  saveSetting('view', view);
  refresh();
}
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

$('#user-select').addEventListener('change', (e) => {
  state.userId = e.target.value === 'all' ? 'all' : Number(e.target.value);
  saveSetting('userId', state.userId);
  drawView(); // data is already loaded; no need to fetch again
});
$('#me-select').addEventListener('change', (e) => {
  state.meId = Number(e.target.value);
  saveSetting('meId', state.meId);
  status.render(state.users.find((u) => u.id === state.meId));
  drawView(); // refreshes the "(you)" marker
});

// ---- keyboard ----------------------------------------------------------------
// Meetings, tasks and month cells are focusable (Tab); Enter or Space "clicks" them.
const ACTIVATABLE = '.event, .tv-block, .m-event, .m-cell, .chip';
$('main').addEventListener('keydown', (e) => {
  if ((e.key !== 'Enter' && e.key !== ' ') || !e.target.matches(ACTIVATABLE)) return;
  e.preventDefault(); // Space would otherwise scroll the page
  e.target.click();
});

// ---- meetings: create / edit ------------------------------------------------
const SLOT_MINUTES = 30; // clicking an empty slot snaps to this grid

const eventById = (id) => state.data.events.find((e) => e.id === Number(id));
const taskById = (id) => state.data.tasks.find((t) => t.id === Number(id));

/** Open the edit dialog if the click hit a task chip. Returns true when it did. */
function openTaskFromClick(e) {
  const chip = e.target.closest('.chip');
  if (!chip) return false;
  const task = taskById(chip.dataset.taskId);
  if (task) taskDialog.openEdit(task);
  return true;
}

$('#new-meeting').addEventListener('click', () => meetings.openNew());
$('#new-task').addEventListener('click', () => taskDialog.openNew());

// Day/week view: click an event to edit it, a deadline chip to edit the task, an empty spot in the "Due" row to
// add a task for that day, or an empty spot in a day column to create a meeting there.
$('#week').addEventListener('click', (e) => {
  const eventEl = e.target.closest('.event');
  if (eventEl) {
    const ev = eventById(eventEl.dataset.id);
    if (ev) meetings.openEdit(ev);
    return;
  }
  if (openTaskFromClick(e)) return;
  const dueCell = e.target.closest('.deadline-cell');
  if (dueCell) {
    const index = [...$('#week').querySelectorAll('.deadline-cell')].indexOf(dueCell);
    const due = addDays(currentRange().from, index);
    due.setHours(17, 0, 0, 0);
    taskDialog.openNew({ due });
    return;
  }
  const col = e.target.closest('.day-col');
  if (!col) return;
  const dayIndex = [...$('#week').querySelectorAll('.day-col')].indexOf(col);
  const minutesFromGridStart = ((e.clientY - col.getBoundingClientRect().top) / ZOOM_LEVELS[state.zoom]) * 60;
  const snapped = Math.floor(minutesFromGridStart / SLOT_MINUTES) * SLOT_MINUTES;
  const start = addDays(currentRange().from, dayIndex);
  start.setHours(0, GRID_START_HOUR * 60 + snapped, 0, 0);
  meetings.openNew({ start });
});

// Month view: click a meeting or task to edit it, click anywhere else in a day to open that day.
$('#month').addEventListener('click', (e) => {
  const item = e.target.closest('.m-event');
  if (item) {
    const ev = eventById(item.dataset.id);
    if (ev) meetings.openEdit(ev);
    return;
  }
  if (openTaskFromClick(e)) return;
  const cell = e.target.closest('.m-cell');
  if (!cell) return;
  state.date = fromDateInput(cell.dataset.date);
  setView('day');
});

// Team view: click a block to edit it, click an empty spot in a person's row to invite that person.
$('#team-view').addEventListener('click', (e) => {
  const block = e.target.closest('.tv-block');
  if (block) {
    const ev = eventById(block.dataset.id);
    if (ev) meetings.openEdit(ev);
    return;
  }
  const track = e.target.closest('.tv-track');
  if (!track) return;
  const minutesFromGridStart = ((e.clientX - track.getBoundingClientRect().left) / hourWidth(state.zoom)) * 60;
  const snapped = Math.floor(minutesFromGridStart / SLOT_MINUTES) * SLOT_MINUTES;
  const start = new Date(currentRange().from);
  start.setHours(0, GRID_START_HOUR * 60 + snapped, 0, 0);
  meetings.openNew({ start, attendeeIds: [Number(track.dataset.user)] });
});

// ---- live updates ----------------------------------------------------------
let wasConnected = false;
function connectLive() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  const indicator = $('#live-indicator');
  ws.onopen = () => {
    indicator.textContent = '● live';
    indicator.className = 'live on';
    setProblem('live', null);
    if (wasConnected) refresh(); // catch up on changes missed while offline
    wasConnected = true;
  };
  ws.onmessage = refresh;
  ws.onclose = () => {
    indicator.textContent = '● offline';
    indicator.className = 'live off';
    setProblem('live', 'Live updates are offline. Reconnecting…');
    setTimeout(connectLive, 2000); // auto-reconnect
  };
}

initTheme($('#theme-toggle'));
refresh();
connectLive();
setInterval(refresh, 60_000); // "busy now" and the time line change with the clock
