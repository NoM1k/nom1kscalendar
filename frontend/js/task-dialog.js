// Task dialog: create / edit / complete / delete a task or deadline.
import { api } from './api.js';
import { esc, toDateInput } from './util.js';

const pad = (n) => String(n).padStart(2, '0');
const toTimeInput = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * @param {{getUsers: () => object[], getMeId: () => number|null, onChanged: () => void}} deps
 * @returns {{openNew: (opts?: {due?: Date, ownerId?: number}) => void, openEdit: (task: object) => void}}
 */
export function initTaskDialog({ getUsers, getMeId, onChanged }) {
  const dialog = document.querySelector('#task-dialog');
  const $ = (selector) => dialog.querySelector(selector);
  const el = {
    heading: $('#td-heading'), title: $('#td-title'), date: $('#td-date'), time: $('#td-time'), owner: $('#td-owner'),
    doneWrap: $('#td-done-wrap'), done: $('#td-done'), error: $('#td-error'), submit: $('#td-submit'), del: $('#td-delete'),
  };

  let editing = null; // the task being edited, or null when creating

  function open({ task = null, due, ownerId }) {
    editing = task;
    el.heading.textContent = task ? 'Edit task' : 'New task';
    el.title.value = task?.title ?? '';
    el.date.value = toDateInput(due);
    el.time.value = toTimeInput(due);
    el.owner.innerHTML = getUsers().map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
    el.owner.value = String(ownerId ?? getMeId() ?? '');
    el.done.checked = !!task?.done;
    el.doneWrap.hidden = !task; // "done" only makes sense for an existing task
    el.del.hidden = !task;
    el.submit.textContent = task ? 'Save' : 'Create task';
    el.error.textContent = '';
    dialog.showModal();
    el.title.focus();
  }

  function openNew({ due, ownerId } = {}) {
    let when = due;
    if (!when) {
      when = new Date();
      when.setHours(17, 0, 0, 0); // default deadline: 17:00 today
    }
    open({ due: when, ownerId });
  }

  function openEdit(task) {
    open({ task, due: new Date(task.due), ownerId: task.ownerId });
  }

  $('#td-cancel').addEventListener('click', () => dialog.close());

  dialog.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    el.error.textContent = '';
    if (!el.title.value.trim()) return (el.error.textContent = 'Please enter a title.');
    if (!el.date.value || !el.time.value) return (el.error.textContent = 'Please enter a due date and time.');

    const body = {
      title: el.title.value.trim(),
      due: new Date(`${el.date.value}T${el.time.value}`).toISOString(),
      ownerId: Number(el.owner.value),
    };
    el.submit.disabled = true;
    try {
      if (editing) await api.updateTask(editing.id, { ...body, done: el.done.checked });
      else await api.createTask(body);
      dialog.close();
      onChanged();
    } catch (err) {
      console.error(err);
      el.error.textContent = 'Could not save the task. Please try again.';
    } finally {
      el.submit.disabled = false;
    }
  });

  el.del.addEventListener('click', async () => {
    if (!editing || !confirm(`Delete "${editing.title}"?`)) return;
    try {
      await api.deleteTask(editing.id);
      dialog.close();
      onChanged();
    } catch (err) {
      console.error(err);
      el.error.textContent = 'Could not delete the task. Please try again.';
    }
  });

  return { openNew, openEdit };
}
