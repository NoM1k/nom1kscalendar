// Week view: 7 day columns (Mon-Sun), a deadlines row and a time grid with meetings.
import { esc, addDays, isSameDay, fmtTime, startOfDay } from '../util.js';

export const GRID_START_HOUR = 7;
export const GRID_END_HOUR = 20;
const GRID_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60;
const MIN_EVENT_PX = 20;

/** Zoom levels = pixel height of one hour. The app stores the selected index. */
export const ZOOM_LEVELS = [32, 48, 72, 96, 144];
export const DEFAULT_ZOOM = 1;

const minutesToPx = (min, hourPx) => (min / 60) * hourPx;

/** Clip an event to one day and return its visible box { top, height } in px, or null if not on that day. */
function boxForDay(ev, dayStart, hourPx) {
  const dayEnd = addDays(dayStart, 1);
  const start = Math.max(new Date(ev.start), dayStart);
  const end = Math.min(new Date(ev.end), dayEnd);
  if (start >= end) return null;

  const startMin = (start - dayStart) / 60000 - GRID_START_HOUR * 60;
  const endMin = (end - dayStart) / 60000 - GRID_START_HOUR * 60;
  const gridPx = minutesToPx(GRID_MINUTES, hourPx);
  const top = Math.min(Math.max(minutesToPx(startMin, hourPx), 0), gridPx - MIN_EVENT_PX);
  const bottom = Math.min(Math.max(minutesToPx(endMin, hourPx), 0), gridPx);
  return { start, end, top, height: Math.max(bottom - top, MIN_EVENT_PX) };
}

/** Place overlapping events side by side. Adds `lane` and `lanes` to each item. */
function assignLanes(items) {
  items.sort((a, b) => a.top - b.top || b.height - a.height);
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const lanes = Math.max(...cluster.map((i) => i.lane)) + 1;
    cluster.forEach((i) => (i.lanes = lanes));
    cluster = [];
  };
  for (const item of items) {
    if (cluster.length && item.top >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.top + c.height > item.top).map((c) => c.lane));
    item.lane = 0;
    while (taken.has(item.lane)) item.lane++;
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.top + item.height);
  }
  if (cluster.length) flush();
}

function eventTooltip(ev, usersById) {
  const names = ev.attendeeIds.map((id) => usersById.get(id)?.name).filter(Boolean).join(', ');
  return [ev.title, `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`, ev.location, names && `With: ${names}`]
    .filter(Boolean)
    .join('\n');
}

function renderEvent(item, usersById, detailed) {
  const ev = item.ev;
  const names = ev.attendeeIds.map((id) => usersById.get(id)?.name).filter(Boolean).join(', ');
  const meta = [ev.location, names && `With: ${names}`].filter(Boolean).join(' · ');
  const color = usersById.get(ev.organizerId)?.color ?? '#4f6bed';
  const width = 100 / item.lanes;
  return `
    <div class="event" data-id="${ev.id}" tabindex="0" role="button" title="${esc(eventTooltip(ev, usersById))}"
         style="top:${item.top}px;height:${item.height}px;left:calc(${item.lane * width}% + 2px);width:calc(${width}% - 4px);--c:${esc(color)}">
      <div class="event-title">${esc(ev.title)}</div>
      <div class="event-time">${fmtTime(item.start)} – ${fmtTime(item.end)}</div>
      ${detailed && meta ? `<div class="event-meta">${esc(meta)}</div>` : ''}
    </div>`;
}

function renderTask(task, usersById, showOwner) {
  const owner = usersById.get(task.ownerId);
  const label = `${fmtTime(task.due)} ${task.title}${showOwner && owner ? ` (${owner.name})` : ''}`;
  return `
    <div class="chip ${task.done ? 'done' : ''}" data-task-id="${task.id}" tabindex="0" role="button" title="${esc(label)}" style="--c:${esc(owner?.color ?? '#6b7280')}">
      <span class="chip-dot"></span>${esc(label)}
    </div>`;
}

/**
 * @param {HTMLElement} container
 * @param {{weekStart: Date, events: object[], tasks: object[], users: object[], userId: number|'all', zoom?: number,
 *   days?: number, detailed?: boolean}} data
 *   `zoom` is an index into ZOOM_LEVELS. `days` is the number of columns (7 = week, 1 = day view, see day.js);
 *   `detailed` adds location and attendees inside the event boxes.
 */
export function renderWeek(container, { weekStart, events, tasks, users, userId, zoom = DEFAULT_ZOOM, days: dayCount = 7, detailed = false }) {
  const hourPx = ZOOM_LEVELS[zoom] ?? ZOOM_LEVELS[DEFAULT_ZOOM];
  const usersById = new Map(users.map((u) => [u.id, u]));
  const days = Array.from({ length: dayCount }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const showAll = userId === 'all';

  // Keep the scroll position across live re-renders.
  const previousScroll = container.querySelector('.week-body')?.scrollTop;

  const visibleEvents = events.filter((e) => showAll || e.attendeeIds.includes(userId));
  const visibleTasks = tasks.filter((t) => showAll || t.ownerId === userId);

  const header = days
    .map(
      (d) => `
      <div class="day-head ${isSameDay(d, today) ? 'today' : ''}">
        <span class="dow">${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        <span class="dom">${d.getDate()}</span>
      </div>`
    )
    .join('');

  const deadlines = days
    .map((d) => {
      const ds = startOfDay(d);
      const de = addDays(ds, 1);
      const chips = visibleTasks
        .filter((t) => new Date(t.due) >= ds && new Date(t.due) < de)
        .map((t) => renderTask(t, usersById, showAll))
        .join('');
      return `<div class="deadline-cell">${chips}</div>`;
    })
    .join('');

  const hourLabels = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => {
    const h = String(GRID_START_HOUR + i).padStart(2, '0');
    return `<div class="hour-label"><span>${h}:00</span></div>`;
  }).join('');

  const columns = days
    .map((d) => {
      const ds = startOfDay(d);
      const items = visibleEvents
        .map((ev) => {
          const box = boxForDay(ev, ds, hourPx);
          return box && { ev, ...box };
        })
        .filter(Boolean);
      assignLanes(items);

      let nowLine = '';
      if (isSameDay(d, today)) {
        const nowMin = (today - ds) / 60000 - GRID_START_HOUR * 60;
        if (nowMin >= 0 && nowMin <= GRID_MINUTES) nowLine = `<div class="now-line" style="top:${minutesToPx(nowMin, hourPx)}px"></div>`;
      }
      return `<div class="day-col ${isSameDay(d, today) ? 'today' : ''}">${items.map((i) => renderEvent(i, usersById, detailed)).join('')}${nowLine}</div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="week ${dayCount === 1 ? 'single-day' : ''}" style="--hour:${hourPx}px;--days:${dayCount}">
      <div class="week-head"><div class="gutter"></div>${header}</div>
      <div class="week-deadlines"><div class="gutter deadline-label">Due</div>${deadlines}</div>
      <div class="week-body">
        <div class="week-grid"><div class="gutter">${hourLabels}</div>${columns}</div>
      </div>
    </div>`;

  const body = container.querySelector('.week-body');
  if (previousScroll !== undefined) {
    body.scrollTop = previousScroll;
  } else {
    // First render: scroll so that "now" (or 08:00) is near the top.
    const hour = days.some((d) => isSameDay(d, today)) ? Math.max(today.getHours() - 1, GRID_START_HOUR) : 8;
    body.scrollTop = (hour - GRID_START_HOUR) * hourPx;
  }
}
