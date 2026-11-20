// Month view: a calendar grid (weeks start on Monday) with meetings and deadlines per day.
// Clicking a day opens the day view; clicking a meeting opens it for editing (handled in app.js).
import { esc, addDays, fmtTime, isSameDay, startOfDay, toDateInput } from '../util.js';

const MAX_ITEMS = 4; // visible entries per day cell; the rest is summarised as "+N more"

/**
 * @param {HTMLElement} container
 * @param {{rangeStart: Date, rangeEnd: Date, month: Date, events: object[], tasks: object[], users: object[],
 *   userId: number|'all'}} data  rangeStart is a Monday, rangeEnd is exclusive; `month` is any day of the shown month.
 */
export function renderMonth(container, { rangeStart, rangeEnd, month, events, tasks, users, userId }) {
  const usersById = new Map(users.map((u) => [u.id, u]));
  const showAll = userId === 'all';
  const visibleEvents = events.filter((e) => showAll || e.attendeeIds.includes(userId));
  const visibleTasks = tasks.filter((t) => showAll || t.ownerId === userId);
  const dayCount = Math.round((rangeEnd - rangeStart) / 86_400_000);
  const today = new Date();

  const header = Array.from({ length: 7 }, (_, i) =>
    `<div class="m-dow">${addDays(rangeStart, i).toLocaleDateString('en-GB', { weekday: 'short' })}</div>`
  ).join('');

  const cells = Array.from({ length: dayCount }, (_, i) => {
    const day = addDays(rangeStart, i);
    const dayStart = startOfDay(day);
    const dayEnd = addDays(dayStart, 1);

    // Meetings overlapping this day and deadlines due on it, in time order.
    const items = [
      ...visibleEvents
        .filter((ev) => new Date(ev.start) < dayEnd && new Date(ev.end) > dayStart)
        .map((ev) => {
          const color = usersById.get(ev.organizerId)?.color ?? '#4f6bed';
          const startsToday = new Date(ev.start) >= dayStart;
          const time = startsToday ? fmtTime(ev.start) : '…'; // multi-day meetings continue here
          return {
            at: Math.max(new Date(ev.start), dayStart),
            html: `<div class="m-item m-event" data-id="${ev.id}" tabindex="0" role="button" title="${esc(`${ev.title}\n${fmtTime(ev.start)} – ${fmtTime(ev.end)}`)}" style="--c:${esc(color)}"><span class="m-time">${time}</span> ${esc(ev.title)}</div>`,
          };
        }),
      ...visibleTasks
        .filter((t) => new Date(t.due) >= dayStart && new Date(t.due) < dayEnd)
        .map((t) => {
          const owner = usersById.get(t.ownerId);
          const label = `${fmtTime(t.due)} ${t.title}${showAll && owner ? ` (${owner.name})` : ''}`;
          return {
            at: new Date(t.due),
            html: `<div class="chip m-item ${t.done ? 'done' : ''}" data-task-id="${t.id}" tabindex="0" role="button" title="${esc(label)}" style="--c:${esc(owner?.color ?? '#6b7280')}"><span class="chip-dot"></span>${esc(label)}</div>`,
          };
        }),
    ].sort((a, b) => a.at - b.at);

    const shown = items.slice(0, MAX_ITEMS).map((i) => i.html).join('');
    const more = items.length > MAX_ITEMS ? `<div class="m-more">+${items.length - MAX_ITEMS} more</div>` : '';
    const classes = [
      'm-cell',
      day.getMonth() !== month.getMonth() ? 'other' : '',
      isSameDay(day, today) ? 'today' : '',
    ].join(' ');

    const label = day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<div class="${classes}" data-date="${toDateInput(day)}" tabindex="0" role="button" aria-label="Open ${label}"><div class="m-date">${day.getDate()}</div>${shown}${more}</div>`;
  }).join('');

  container.innerHTML = `<div class="month"><div class="m-head">${header}</div><div class="m-grid">${cells}</div></div>`;
}
