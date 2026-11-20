// Meeting dialog: create / edit / delete a meeting.
// While you pick date, time and attendees it checks availability live and shows, per person, whether they
// are free, busy (with the conflicting meeting) and where they are (office status, for today).
// Conflicts only warn; they never block saving.
import { api } from './api.js';
import { esc, fmtTime, isSameDay, toDateInput } from './util.js';

const OFFICE_LABEL = { office: 'In office', home: 'Home office', away: 'Away' };
const pad = (n) => String(n).padStart(2, '0');
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * @param {{getUsers: () => object[], getMeId: () => number|null, onChanged: () => void}} deps
 * @returns {{openNew: (opts?: {start?: Date, attendeeIds?: number[]}) => void, openEdit: (event: object) => void}}
 */
export function initMeetingDialog({ getUsers, getMeId, onChanged }) {
  const $ = (selector) => dialog.querySelector(selector);
  const dialog = document.querySelector('#meeting-dialog');
  const form = $('form');
  const el = {
    heading: $('#md-heading'), title: $('#md-title'), date: $('#md-date'), start: $('#md-start'), end: $('#md-end'),
    multiday: $('#md-multiday'), endDateWrap: $('#md-enddate-wrap'), endDate: $('#md-end-date'),
    location: $('#md-location'), organizer: $('#md-organizer'), attendees: $('#md-attendees'),
    summary: $('#md-summary'), error: $('#md-error'), submit: $('#md-submit'), del: $('#md-delete'),
  };

  let editing = null; // the event being edited, or null when creating
  let organizerId = null;
  let timer = null;
  let requestSeq = 0; // ignore out-of-date availability responses

  // ---- helpers -------------------------------------------------------------
  /** Start/end Date objects from the form, or null if incomplete or end is not after start. */
  function readRange() {
    const endDay = el.multiday.checked ? el.endDate.value : el.date.value;
    if (!el.date.value || !el.start.value || !endDay || !el.end.value) return null;
    const start = new Date(`${el.date.value}T${el.start.value}`);
    const end = new Date(`${endDay}T${el.end.value}`);
    return end > start ? { start, end } : null;
  }

  const selectedIds = () => [...el.attendees.querySelectorAll('input:checked')].map((i) => Number(i.value));

  function renderAttendees(preselected) {
    el.attendees.innerHTML = getUsers()
      .map((u) => {
        const isOrganizer = u.id === organizerId;
        const checked = isOrganizer || preselected.includes(u.id);
        return `
          <label class="att">
            <input type="checkbox" value="${u.id}" ${checked ? 'checked' : ''} ${isOrganizer ? 'disabled' : ''} />
            <span class="dot" style="background:${esc(u.color)}"></span>
            <span class="att-name">${esc(u.name)}${isOrganizer ? ' <em>(organizer)</em>' : ''}</span>
            <span class="att-status" data-user="${u.id}"></span>
          </label>`;
      })
      .join('');
  }

  // ---- live availability check ---------------------------------------------
  function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(checkAvailability, 150);
  }

  async function checkAvailability() {
    const range = readRange();
    const seq = ++requestSeq;
    if (!range) {
      el.attendees.querySelectorAll('.att-status').forEach((s) => (s.innerHTML = ''));
      el.summary.className = 'md-summary';
      el.summary.textContent = 'Enter dates and times so that the meeting ends after it starts to check availability.';
      return;
    }
    let result;
    try {
      result = await api.availability(range.start.toISOString(), range.end.toISOString(), editing?.id);
    } catch (err) {
      console.error(err);
      return;
    }
    if (seq !== requestSeq) return; // a newer check is already running

    // Office status and "do not disturb" are live values, so they only apply to today's meetings.
    const isToday = isSameDay(range.start, new Date());
    const byId = new Map(result.map((r) => [r.userId, r]));
    const problems = []; // { name, text }

    for (const status of el.attendees.querySelectorAll('.att-status')) {
      const r = byId.get(Number(status.dataset.user));
      if (!r) continue;
      const busy = r.conflicts.length > 0 || (isToday && r.manualBusy);
      let html = busy ? '<span class="badge busy">Busy</span>' : '<span class="badge free">Free</span>';
      if (r.conflicts.length) {
        const c = r.conflicts[0];
        const more = r.conflicts.length > 1 ? ` +${r.conflicts.length - 1}` : '';
        html += ` <span class="att-detail">${esc(c.title)} ${fmtTime(c.start)}–${fmtTime(c.end)}${more}</span>`;
      } else if (isToday && r.manualBusy) {
        html += ' <span class="att-detail">Do not disturb</span>';
      }
      if (isToday) html += ` <span class="badge ${r.officeStatus}">${OFFICE_LABEL[r.officeStatus]}</span>`;
      status.innerHTML = html;

      if (selectedIds().includes(r.userId)) {
        if (busy) problems.push({ name: r.name, text: 'has a conflict' });
        else if (isToday && r.officeStatus === 'away') problems.push({ name: r.name, text: 'is away today' });
      }
    }

    el.summary.className = `md-summary ${problems.length ? 'warn' : 'ok'}`;
    el.summary.textContent = problems.length
      ? `Heads up: ${problems.map((p) => `${p.name} ${p.text}`).join('; ')}.`
      : 'Everyone selected is free at this time.';
    el.submit.textContent = problems.length ? (editing ? 'Save anyway' : 'Create anyway') : editing ? 'Save' : 'Create meeting';
  }

  // ---- open ----------------------------------------------------------------
  function open({ event = null, start, end, attendeeIds = [] }) {
    editing = event;
    organizerId = event ? event.organizerId : getMeId();
    const users = getUsers();
    el.heading.textContent = event ? 'Edit meeting' : 'New meeting';
    el.organizer.textContent = users.find((u) => u.id === organizerId)?.name ?? '';
    el.title.value = event?.title ?? '';
    el.location.value = event?.location ?? '';
    el.date.value = toDateInput(start);
    el.start.value = toTimeInput(start);
    el.end.value = toTimeInput(end);
    el.endDate.value = toDateInput(end);
    el.multiday.checked = !isSameDay(start, end); // existing multi-day meetings keep their end date
    el.endDateWrap.hidden = !el.multiday.checked;
    el.error.textContent = '';
    el.del.hidden = !event;
    el.submit.textContent = event ? 'Save' : 'Create meeting';
    renderAttendees(event ? event.attendeeIds : attendeeIds);
    dialog.showModal();
    el.title.focus();
    checkAvailability();
  }

  function openNew({ start, attendeeIds = [] } = {}) {
    let from = start;
    if (!from) {
      from = new Date();
      from.setHours(from.getHours() + 1, 0, 0, 0); // next full hour
    }
    let to = new Date(from.getTime() + 60 * 60 * 1000);
    if (!isSameDay(from, to)) {
      to = new Date(from);
      to.setHours(23, 59, 0, 0); // the form handles single-day meetings
    }
    open({ start: from, end: to, attendeeIds });
  }

  function openEdit(event) {
    open({ event, start: new Date(event.start), end: new Date(event.end) });
  }

  // ---- events --------------------------------------------------------------
  for (const input of [el.date, el.start, el.end, el.endDate]) input.addEventListener('input', scheduleCheck);
  el.date.addEventListener('input', () => {
    // The end date never lies before the start date.
    if (!el.endDate.value || el.endDate.value < el.date.value) el.endDate.value = el.date.value;
  });
  el.multiday.addEventListener('change', () => {
    el.endDateWrap.hidden = !el.multiday.checked;
    if (el.multiday.checked && (!el.endDate.value || el.endDate.value < el.date.value)) el.endDate.value = el.date.value;
    scheduleCheck();
  });
  el.attendees.addEventListener('change', scheduleCheck);
  $('#md-cancel').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    el.error.textContent = '';
    const range = readRange();
    if (!el.title.value.trim()) return (el.error.textContent = 'Please enter a title.');
    if (!range) return (el.error.textContent = 'The meeting must end after it starts.');

    const body = {
      title: el.title.value.trim(),
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      location: el.location.value.trim(),
      organizerId,
      attendeeIds: selectedIds(),
    };
    el.submit.disabled = true;
    try {
      if (editing) await api.updateEvent(editing.id, body);
      else await api.createEvent(body);
      dialog.close();
      onChanged();
    } catch (err) {
      console.error(err);
      el.error.textContent = 'Could not save the meeting. Please try again.';
    } finally {
      el.submit.disabled = false;
    }
  });

  el.del.addEventListener('click', async () => {
    if (!editing || !confirm(`Delete "${editing.title}"?`)) return;
    try {
      await api.deleteEvent(editing.id);
      dialog.close();
      onChanged();
    } catch (err) {
      console.error(err);
      el.error.textContent = 'Could not delete the meeting. Please try again.';
    }
  });

  return { openNew, openEdit };
}
