/**
 * Single time convention: DATETIMEs are stored as *local server time*,
 * matching MySQL's NOW()/CURDATE(). The API serializes them back to ISO with
 * the correct offset (mysql2 parses naive datetimes as local), so the client
 * always renders correct wall-clock times.
 */
const pad = (n) => String(n).padStart(2, '0');

/** JS Date (or ISO string) → "YYYY-MM-DD HH:MM:SS" in local time. */
export function toSqlDateTime(input) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** JS Date → "YYYY-MM-DD" in local time. */
export function toLocalDateStr(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
