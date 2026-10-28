import { addDays, compareDateKeys, dayOfWeek } from './dates.js';

export function scheduledServicesForDate(dateKey, churchSchedule) {
  const weekday = dayOfWeek(dateKey);
  return (churchSchedule?.[weekday] ?? []).filter(item => item.enabled !== false);
}

export function attendedAllScheduledServices(dateKey, churchSchedule, attendance) {
  const scheduled = scheduledServicesForDate(dateKey, churchSchedule);
  if (scheduled.length === 0) return null; // día no aplicable
  const byId = new Map(attendance.filter(a => a.date === dateKey).map(a => [a.serviceId, a.status]));
  return scheduled.every(service => byId.get(service.id) === 'attended');
}

export function readingDayComplete(dateKey, readings) {
  return readings.some(r => r.date === dateKey);
}

export function prayerDayComplete(dateKey, prayerDays, prayerSessions) {
  return prayerDays.some(p => p.date === dateKey && p.quick === true) || prayerSessions.some(s => s.date === dateKey && s.completed === true);
}

/**
 * Calcula una racha hacia atrás desde endDate.
 * applicable(date) permite saltar días no aplicables (p. ej. lunes sin culto).
 * Los días futuros nunca deben pasarse como endDate.
 */
export function calculateStreak({ endDate, complete, applicable = () => true, earliestDate = '1900-01-01' }) {
  let streak = 0;
  let cursor = endDate;
  let guard = 0;
  while (compareDateKeys(cursor, earliestDate) >= 0 && guard++ < 50000) {
    if (!applicable(cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!complete(cursor)) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function calculateReadingStreak(today, readings, earliestDate = '1900-01-01') {
  const endDate = readingDayComplete(today, readings) ? today : addDays(today, -1);
  return calculateStreak({ endDate, earliestDate, complete: d => readingDayComplete(d, readings) });
}

export function calculatePrayerStreak(today, prayerDays, prayerSessions, earliestDate = '1900-01-01') {
  const todayComplete = prayerDayComplete(today, prayerDays, prayerSessions);
  const explicitNoToday = prayerDays.some(p => p.date === today && p.quick === false);
  if (explicitNoToday && !todayComplete) return 0;
  const endDate = todayComplete ? today : addDays(today, -1);
  return calculateStreak({ endDate, earliestDate, complete: d => prayerDayComplete(d, prayerDays, prayerSessions) });
}

export function calculateChurchStreak(today, churchSchedule, attendance, earliestDate = '1900-01-01') {
  const servicesToday = scheduledServicesForDate(today, churchSchedule);
  const todayRecords = attendance.filter(a => a.date === today && servicesToday.some(s => s.id === a.serviceId));
  if (todayRecords.some(a => a.status === 'missed')) return 0;
  const todayComplete = attendedAllScheduledServices(today, churchSchedule, attendance) === true;
  const endDate = servicesToday.length > 0 && todayComplete ? today : addDays(today, -1);
  return calculateStreak({
    endDate,
    earliestDate,
    applicable: d => scheduledServicesForDate(d, churchSchedule).length > 0,
    complete: d => attendedAllScheduledServices(d, churchSchedule, attendance) === true
  });
}
