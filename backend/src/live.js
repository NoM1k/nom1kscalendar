// Live updates: a WebSocket endpoint at /ws.
// Whenever data changes, the server broadcasts { type: "changed", entity: "<name>" }.
// Clients then re-fetch the affected data via the REST API.
import { WebSocketServer, WebSocket } from 'ws';

let wss = null;

export function attachLive(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });
}

export function broadcast(entity) {
  if (!wss) return;
  const message = JSON.stringify({ type: 'changed', entity });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  }
}
