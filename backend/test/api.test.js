// API tests (run with `npm test`). They start the real server with a temporary database.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { startServer } from './helpers.js';

let api;
let users; // seeded demo users: Alice, Ben, Clara, Dan (alphabetical)

before(async () => {
  api = await startServer();
  users = (await api.get('/api/users')).body;
});
after(() => api.stop());

// Far in the future so the relative demo data never overlaps with test meetings.
const at = (hour, minute = 0, day = 15) => new Date(Date.UTC(2030, 0, day, hour, minute)).toISOString();

describe('users', () => {
  test('lists the seeded demo users with derived status', async () => {
    const { status, body } = await api.get('/api/users');
    assert.equal(status, 200);
    assert.equal(body.length, 4);
    assert.deepEqual(body.map((u) => u.name), ['Alice Meier', 'Ben Keller', 'Clara Frei', 'Dan Huber']);
    for (const u of body) {
      assert.ok(['office', 'home', 'away'].includes(u.officeStatus));
      assert.equal(typeof u.busyNow, 'boolean');
    }
  });

  test('updates office status and manual busy', async () => {
    const dan = users.find((u) => u.name.startsWith('Dan'));
    const { status, body } = await api.put(`/api/users/${dan.id}/status`, { officeStatus: 'home', manualBusy: true });
    assert.equal(status, 200);
    assert.equal(body.officeStatus, 'home');
    assert.equal(body.manualBusy, true);
    assert.equal(body.busyNow, true);

    const reset = await api.put(`/api/users/${dan.id}/status`, { manualBusy: false });
    assert.equal(reset.body.manualBusy, false);
    assert.equal(reset.body.officeStatus, 'home', 'fields that are not sent stay unchanged');
  });

  test('rejects invalid status values and unknown users', async () => {
    const [alice] = users;
    assert.equal((await api.put(`/api/users/${alice.id}/status`, { officeStatus: 'moon' })).status, 400);
    assert.equal((await api.put(`/api/users/${alice.id}/status`, { manualBusy: 'yes' })).status, 400);
    assert.equal((await api.put('/api/users/9999/status', { officeStatus: 'home' })).status, 404);
    assert.equal((await api.put('/api/users/abc/status', { officeStatus: 'home' })).status, 404);
  });
});

describe('events', () => {
  const [alice, ben, clara] = [0, 1, 2];
  let created;

  test('creates an event; the organizer is always an attendee', async () => {
    const { status, body } = await api.post('/api/events', {
      title: '  Planning  ', start: at(9), end: at(10), location: 'Room 7',
      organizerId: users[alice].id, attendeeIds: [users[ben].id, users[ben].id],
    });
    assert.equal(status, 201);
    assert.equal(body.title, 'Planning', 'title is trimmed');
    assert.equal(body.location, 'Room 7');
    assert.deepEqual([...body.attendeeIds].sort(), [users[alice].id, users[ben].id].sort(), 'deduplicated + organizer');
    created = body;
  });

  test('rejects invalid input', async () => {
    const valid = { title: 'X', start: at(9), end: at(10), organizerId: users[alice].id };
    const cases = [
      { ...valid, title: '   ' },
      { ...valid, start: 'not a date' },
      { ...valid, end: at(9) }, // end == start
      { ...valid, end: at(8) }, // end before start
      { ...valid, organizerId: 9999 },
      { ...valid, organizerId: undefined },
    ];
    for (const body of cases) {
      assert.equal((await api.post('/api/events', body)).status, 400, JSON.stringify(body));
    }
  });

  test('ignores unknown attendee ids', async () => {
    const { status, body } = await api.post('/api/events', {
      title: 'Ghosts', start: at(11), end: at(12), organizerId: users[alice].id, attendeeIds: [9999],
    });
    assert.equal(status, 201);
    assert.deepEqual(body.attendeeIds, [users[alice].id]);
    await api.del(`/api/events/${body.id}`);
  });

  test('lists events overlapping a range', async () => {
    const inRange = await api.get(`/api/events?from=${at(9, 30)}&to=${at(9, 45)}`);
    assert.ok(inRange.body.some((e) => e.id === created.id), 'event overlapping the range is returned');

    const touching = await api.get(`/api/events?from=${at(10)}&to=${at(11)}`);
    assert.ok(!touching.body.some((e) => e.id === created.id), 'an event ending exactly at "from" is not returned');

    const bad = await api.get('/api/events?from=nope');
    assert.equal(bad.status, 400);
  });

  test('updates an event including attendees', async () => {
    const { status, body } = await api.put(`/api/events/${created.id}`, {
      title: 'Planning v2', start: at(13), end: at(14), organizerId: users[alice].id, attendeeIds: [users[clara].id],
    });
    assert.equal(status, 200);
    assert.equal(body.title, 'Planning v2');
    assert.equal(body.start, at(13));
    assert.deepEqual([...body.attendeeIds].sort(), [users[alice].id, users[clara].id].sort());

    assert.equal((await api.put('/api/events/9999', { title: 'x' })).status, 404);
  });

  test('deletes an event', async () => {
    assert.equal((await api.del(`/api/events/${created.id}`)).status, 204);
    assert.equal((await api.del(`/api/events/${created.id}`)).status, 404);
  });
});

describe('tasks', () => {
  let task;

  test('creates, filters, updates and deletes a task', async () => {
    const ownerId = users[0].id;
    const made = await api.post('/api/tasks', { title: 'Report', due: at(17), ownerId });
    assert.equal(made.status, 201);
    assert.equal(made.body.done, false);
    task = made.body;

    const byRange = await api.get(`/api/tasks?from=${at(0)}&to=${at(23)}&ownerId=${ownerId}`);
    assert.ok(byRange.body.some((t) => t.id === task.id));
    const otherOwner = await api.get(`/api/tasks?from=${at(0)}&to=${at(23)}&ownerId=${users[1].id}`);
    assert.ok(!otherOwner.body.some((t) => t.id === task.id));

    const done = await api.put(`/api/tasks/${task.id}`, { done: true });
    assert.equal(done.status, 200);
    assert.equal(done.body.done, true);
    assert.equal(done.body.title, 'Report', 'untouched fields stay');

    assert.equal((await api.del(`/api/tasks/${task.id}`)).status, 204);
    assert.equal((await api.del(`/api/tasks/${task.id}`)).status, 404);
  });

  test('rejects invalid input', async () => {
    const valid = { title: 'T', due: at(17), ownerId: users[0].id };
    for (const body of [{ ...valid, title: '' }, { ...valid, due: 'x' }, { ...valid, ownerId: 9999 }]) {
      assert.equal((await api.post('/api/tasks', body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await api.get('/api/tasks?ownerId=abc')).status, 400);
    assert.equal((await api.put('/api/tasks/9999', { done: true })).status, 404);
  });
});

describe('availability', () => {
  let event;
  before(async () => {
    event = (
      await api.post('/api/events', {
        title: 'Busy block', start: at(10, 0, 20), end: at(11, 0, 20),
        organizerId: users[0].id, attendeeIds: [users[1].id],
      })
    ).body;
  });
  after(() => api.del(`/api/events/${event.id}`));

  test('reports conflicts per user', async () => {
    const { status, body } = await api.get(`/api/availability?start=${at(10, 30, 20)}&end=${at(11, 30, 20)}`);
    assert.equal(status, 200);
    const byName = Object.fromEntries(body.map((u) => [u.name, u]));
    assert.equal(byName['Alice Meier'].free, false);
    assert.equal(byName['Alice Meier'].conflicts[0].title, 'Busy block');
    assert.equal(byName['Ben Keller'].free, false);
    assert.equal(byName['Clara Frei'].free, true);
  });

  test('back-to-back meetings do not conflict', async () => {
    const { body } = await api.get(`/api/availability?start=${at(11, 0, 20)}&end=${at(12, 0, 20)}`);
    assert.ok(body.every((u) => u.free));
  });

  test('can exclude the event being edited', async () => {
    const { body } = await api.get(`/api/availability?start=${at(10, 0, 20)}&end=${at(11, 0, 20)}&exclude=${event.id}`);
    assert.ok(body.every((u) => u.free));
  });

  test('can be limited to some users', async () => {
    const { body } = await api.get(`/api/availability?start=${at(10, 0, 20)}&end=${at(11, 0, 20)}&userIds=${users[2].id}`);
    assert.equal(body.length, 1);
    assert.equal(body[0].userId, users[2].id);
  });

  test('manual "do not disturb" makes a user not free', async () => {
    const clara = users[2];
    await api.put(`/api/users/${clara.id}/status`, { manualBusy: true });
    const { body } = await api.get(`/api/availability?start=${at(15, 0, 20)}&end=${at(16, 0, 20)}&userIds=${clara.id}`);
    assert.equal(body[0].free, false);
    assert.equal(body[0].manualBusy, true);
    await api.put(`/api/users/${clara.id}/status`, { manualBusy: false });
  });

  test('validates the range', async () => {
    assert.equal((await api.get('/api/availability')).status, 400);
    assert.equal((await api.get(`/api/availability?start=${at(12)}&end=${at(11)}`)).status, 400);
  });
});

describe('general', () => {
  test('unknown API routes return JSON 404', async () => {
    const { status, body } = await api.get('/api/nope');
    assert.equal(status, 404);
    assert.equal(body.error, 'Not found');
  });

  test('malformed JSON bodies return 400', async () => {
    const { status } = await api.raw('POST', '/api/events', '{ not json');
    assert.equal(status, 400);
  });

  test('serves the frontend', async () => {
    const res = await fetch(`${api.baseUrl}/`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Arbeitskalender/);
  });
});

describe('live updates', () => {
  test('broadcasts a "changed" message after a mutation', async () => {
    const ws = new WebSocket(api.wsUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const message = new Promise((resolve) => ws.addEventListener('message', (e) => resolve(JSON.parse(e.data))));

    const { body } = await api.post('/api/events', {
      title: 'Live', start: at(8, 0, 25), end: at(9, 0, 25), organizerId: users[0].id,
    });
    assert.deepEqual(await message, { type: 'changed', entity: 'events' });

    ws.close();
    await api.del(`/api/events/${body.id}`);
  });
});
