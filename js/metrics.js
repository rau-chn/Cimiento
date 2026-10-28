import { eachDate, monthBounds, startOfWeekMonday, endOfWeekSunday } from './dates.js';
import { uniqueReadChapterKeys, planProgress } from './bible.js';
import { readingDayComplete, prayerDayComplete, scheduledServicesForDate } from './streaks.js';

export function rangeMetrics({ start, end, readings, prayerDays, prayerSessions, churchSchedule, attendance }) {
  const dates = eachDate(start, end);
  const readingDays = dates.filter(d => readingDayComplete(d, readings)).length;
  const prayerCompletedDays = dates.filter(d => prayerDayComplete(d, prayerDays, prayerSessions)).length;
  let scheduledServices = 0;
  let attendedServices = 0;
  for (const date of dates) {
    const services = scheduledServicesForDate(date, churchSchedule);
    scheduledServices += services.length;
    for (const service of services) {
      if (attendance.some(a => a.date === date && a.serviceId === service.id && a.status === 'attended')) attendedServices++;
    }
  }
  const prayerMinutes = prayerSessions.filter(s => s.completed && s.date >= start && s.date <= end).reduce((sum, s) => sum + (s.minutes ?? 0), 0);
  const periodReadings = readings.filter(r => r.date >= start && r.date <= end);
  const chaptersRead = uniqueReadChapterKeys(periodReadings).size;
  return {
    days: dates.length,
    readingDays,
    prayerDays: prayerCompletedDays,
    readingPercent: Math.round((readingDays / dates.length) * 100),
    prayerPercent: Math.round((prayerCompletedDays / dates.length) * 100),
    scheduledServices,
    attendedServices,
    attendancePercent: scheduledServices ? Math.round((attendedServices / scheduledServices) * 100) : 0,
    prayerMinutes,
    chaptersRead
  };
}

export function weeklyMetrics(today, data) {
  return rangeMetrics({ start: startOfWeekMonday(today), end: today, ...data });
}

export function monthlyMetrics(today, data) {
  const { start } = monthBounds(today);
  return rangeMetrics({ start, end: today, ...data });
}

export function goalProgress(goal, weekly, data, today) {
  const metric = goal.metric;
  let value = 0;
  if (metric === 'readingDays') value = weekly.readingDays;
  else if (metric === 'prayerDays') value = weekly.prayerDays;
  else if (metric === 'prayerMinutes') value = weekly.prayerMinutes;
  else if (metric === 'chapters') value = weekly.chaptersRead;
  else if (metric === 'servicesAttended') value = weekly.attendedServices;
  return { value, target: goal.target, percent: goal.target ? Math.min(100, Math.round((value / goal.target) * 100)) : 0 };
}

export { planProgress };
