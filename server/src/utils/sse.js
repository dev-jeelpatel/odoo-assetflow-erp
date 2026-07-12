/**
 * Server-Sent Events hub. Each logged-in browser tab holds one connection;
 * we push notification/KPI invalidation events so the UI updates without refresh.
 */
const clients = new Map(); // userId -> Set<res>

export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  res.on('close', () => {
    clients.get(userId)?.delete(res);
    if (clients.get(userId)?.size === 0) clients.delete(userId);
  });
}

function write(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Push an event to one user (all their open tabs). */
export function pushToUser(userId, event, data) {
  for (const res of clients.get(Number(userId)) ?? []) write(res, event, data);
}

/** Push an event to every connected user (e.g. dashboard KPI invalidation). */
export function broadcast(event, data) {
  for (const set of clients.values()) for (const res of set) write(res, event, data);
}
