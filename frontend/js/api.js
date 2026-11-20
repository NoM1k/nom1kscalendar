// Thin wrapper around the REST API (see README.md for the endpoint list).

async function request(path, options) {
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) throw new Error(`${options?.method ?? 'GET'} ${path} -> ${res.status}`);
  return res.status === 204 ? null : res.json();
}

const sendJson = (method, path, body) =>
  request(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  users: () => request('/users'),
  /** patch: { officeStatus?: 'office'|'home'|'away', manualBusy?: boolean } */
  setStatus: (userId, patch) =>
    request(`/users/${userId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  events: (fromIso, toIso) => request(`/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
  /** Free/busy + conflicts per user for a time range; `excludeEventId` ignores the meeting being edited. */
  availability: (startIso, endIso, excludeEventId) =>
    request(
      `/availability?start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}` +
        (excludeEventId ? `&exclude=${excludeEventId}` : '')
    ),
  /** body: { title, start, end, location?, organizerId, attendeeIds? } (ISO dates) */
  createEvent: (body) => sendJson('POST', '/events', body),
  updateEvent: (id, body) => sendJson('PUT', `/events/${id}`, body),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),
  /** body: { title, due, ownerId } for create; { title?, due?, ownerId?, done? } for update (ISO dates) */
  createTask: (body) => sendJson('POST', '/tasks', body),
  updateTask: (id, body) => sendJson('PUT', `/tasks/${id}`, body),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  tasks: (fromIso, toIso) => request(`/tasks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`),
};
