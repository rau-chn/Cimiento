export const LIMA_TIME_ZONE = 'America/Lima';

const limaDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function limaToday(now = new Date()) {
  const parts = limaDateFormatter.formatToParts(now);
  const map = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function parseDateKey(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

// Usa mediodía UTC como representación neutra del día civil; nunca para guardar fechas.
export function dateKeyToUtcNoon(dateKey) {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDays(dateKey, amount) {
  const d = dateKeyToUtcNoon(dateKey);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

export function compareDateKeys(a, b) {
  return a.localeCompare(b);
}

export function dayOfWeek(dateKey) {
  return dateKeyToUtcNoon(dateKey).getUTCDay(); // 0 domingo ... 6 sábado
}

export function startOfWeekMonday(dateKey) {
  const dow = dayOfWeek(dateKey);
  const delta = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, delta);
}

export function endOfWeekSunday(dateKey) {
  return addDays(startOfWeekMonday(dateKey), 6);
}

export function monthBounds(dateKey) {
  const { year, month } = parseDateKey(dateKey);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(Date.UTC(year, month, 0, 12)).getUTCDate();
  return { start, end: `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}` };
}

export function eachDate(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatDateEs(dateKey, options = {}) {
  const d = dateKeyToUtcNoon(dateKey);
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: options.year === false ? undefined : 'numeric',
    weekday: options.weekday ? 'short' : undefined
  }).format(d);
}

export function isSunday(dateKey) {
  return dayOfWeek(dateKey) === 0;
}

export function minutesBetweenEpoch(startEpochMs, endEpochMs = Date.now()) {
  return Math.max(0, Math.floor((endEpochMs - startEpochMs) / 60000));
}
