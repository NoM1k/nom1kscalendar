// Test helper: starts the real server as a child process on a free port with a throw-away database,
// so tests exercise exactly what `npm start` runs without touching backend/data/.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/** Start the server; resolves to { baseUrl, wsUrl, get/post/put/del helpers, stop() }. */
export async function startServer() {
  const port = await freePort();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ak-test-'));
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: { ...process.env, PORT: String(port), DB_FILE: path.join(dir, 'test.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let log = '';
  child.stderr.on('data', (d) => (log += d));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start in time:\n${log}`)), 10_000);
    child.stdout.on('data', (d) => {
      log += d;
      if (String(d).includes('running on')) {
        clearTimeout(timer); // otherwise the pending timer would keep the test process alive
        resolve();
      }
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited early (code ${code}):\n${log}`));
    });
  });

  const baseUrl = `http://localhost:${port}`;

  /** Call the API; returns { status, body } where body is parsed JSON (or null for empty responses). */
  async function call(method, urlPath, body) {
    const res = await fetch(baseUrl + urlPath, {
      method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  return {
    baseUrl,
    wsUrl: `ws://localhost:${port}/ws`,
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    put: (p, b) => call('PUT', p, b),
    del: (p) => call('DELETE', p),
    raw: call,
    async stop() {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
