// Team view: one row per person with a horizontal day timeline.
// Shows at a glance who is in meetings when, plus busy/free and office status (for today).
import { esc, addDays, isSameDay, fmtTime, startOfDay } from '../util.js';
import { DEFAULT_ZOOM, GRID_END_HOUR, GRID_START_HOUR, ZOOM_LEVELS } from './week.js';

export const TEAM_LABEL_PX = 200; // width of the sticky name column (keep in sync with --label-w in style.css)
const OFFICE_LABEL = { office: 'In office', home: 'Home office', away: 'Away' };

/** Width in px of one hour for a zoom index (wider than the week view's row height: there is more room). */
export const hourWidth = (zoom) => (ZOOM_LEVELS[zoom] ?? ZOOM_LEVELS[DEFAULT_ZOOM]) * 1.5;

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

function eventTooltip(ev, usersById) {
  const names = ev.attendeeIds.map((id) => usersById.get(id)?.name).filter(Boolean).join(', ');
  return [ev.title, `${fmtTime(ev.start)} – ${fmtTime(ev.end)}`, ev.location, names && `With: ${names}`]
    .filter(Boolean)
    .join('\n');
}

/**
 * @param {HTMLElement} container
 * @param {{day: Date, events: object[], users: object[], meId: number|null, zoom?: number}} data
 */
export function renderTeamView(container, { day, events, users, meId, zoom = DEFAULT_ZOOM }) {
  const hourW = hourWidth(zoom);
  const hours = GRID_END_HOUR - GRID_START_HOUR;
  const trackW = hours * hourW;
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  const now = new Date();
  const isToday = isSameDay(dayStart, now);
  const usersById = new Map(users.map((u) => [u.id, u]));

  const previousScroll = container.querySelector('.tv-scroll')?.scrollLeft;

  const hourLabels = Array.from({ length: hours }, (_, i) => {
    const h = String(GRID_START_HOUR + i).padStart(2, '0');
    return `<div class="tv-hour" style="width:${hourW}px">${h}:00</div>`;
  }).join('');

  let nowLine = '';
  if (isToday) {
    const nowMin = (now - dayStart) / 60000 - GRID_START_HOUR * 60;
    if (nowMin >= 0 && nowMin <= hours * 60) nowLine = `<div class="tv-now" style="left:${(nowMin / 60) * hourW}px"></div>`;
  }

  const rows = users
    .map((u) => {
      const blocks = events
        .filter((e) => e.attendeeIds.includes(u.id))
        .map((ev) => {
          const start = Math.max(new Date(ev.start), dayStart);
          const end = Math.min(new Date(ev.end), dayEnd);
          if (start >= end) return '';
          const startMin = (start - dayStart) / 60000 - GRID_START_HOUR * 60;
          const endMin = (end - dayStart) / 60000 - GRID_START_HOUR * 60;
          if (endMin <= 0 || startMin >= hours * 60) return ''; // outside the visible hours
          const left = clamp((startMin / 60) * hourW, 0, trackW);
          const right = clamp((endMin / 60) * hourW, 0, trackW);
          const color = usersById.get(ev.organizerId)?.color ?? u.color;
          return `
            <div class="tv-block" data-id="${ev.id}" tabindex="0" role="button" title="${esc(eventTooltip(ev, usersById))}"
                 style="left:${left}px;width:${Math.max(right - left, 6)}px;--c:${esc(color)}">
              <span>${esc(ev.title)}</span>
            </div>`;
        })
        .join('');

      // Office/busy status is a live value, so it is only meaningful for today.
      const badges = isToday
        ? `<span class="badge ${u.busyNow ? 'busy' : 'free'}">${u.busyNow ? 'Busy' : 'Free'}</span>
           <span class="badge ${u.officeStatus}">${OFFICE_LABEL[u.officeStatus]}</span>`
        : '';

      return `
        <div class="tv-row">
          <div class="tv-label">
            <div class="name"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}${u.id === meId ? ' <em>(you)</em>' : ''}</div>
            <div class="badges">${badges}</div>
          </div>
          <div class="tv-track" data-user="${u.id}" style="width:${trackW}px">${blocks}${nowLine}</div>
        </div>`;
    })
    .join('');

  container.innerHTML = `
    <div class="tv" style="--hourw:${hourW}px">
      <div class="tv-scroll">
        <div class="tv-inner" style="width:${TEAM_LABEL_PX + trackW}px">
          <div class="tv-row tv-head"><div class="tv-label tv-corner">Team</div><div class="tv-hours" style="width:${trackW}px">${hourLabels}</div></div>
          ${rows}
        </div>
      </div>
    </div>`;

  const scroller = container.querySelector('.tv-scroll');
  if (previousScroll !== undefined) {
    scroller.scrollLeft = previousScroll;
  } else if (isToday) {
    // First render: bring "now" into view.
    const nowHour = now.getHours() + now.getMinutes() / 60 - GRID_START_HOUR;
    scroller.scrollLeft = Math.max((nowHour - 1) * hourW, 0);
  }
}
