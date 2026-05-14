export interface ScheduleEntry {
  weekday: number;
  from: string;
  to: string;
}

interface DateOption {
  value: number;
  label: string;
}

const WEEKDAY_LABELS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

function parseTimeToMinutes(value: string): number {
  const [hh, mm] = value.split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return 0;
  return (hh * 60) + mm;
}

export function buildPermanentDateOptions(
  schedules: ScheduleEntry[],
  now: Date = new Date(),
  daysAhead = 30,
): DateOption[] {
  if (!Array.isArray(schedules) || schedules.length === 0) {
    return [];
  }

  const options: DateOption[] = [];
  for (let offset = 0; offset <= daysAhead; offset += 1) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(now.getDate() + offset);

    const daySchedules = schedules
      .filter((s) => Number.isInteger(s.weekday) && s.weekday === day.getDay() && !!s.from)
      .sort((a, b) => parseTimeToMinutes(a.from) - parseTimeToMinutes(b.from));

    if (daySchedules.length === 0) continue;

    for (const slot of daySchedules) {
      const [hh, mm] = slot.from.split(':').map(Number);
      const dateTime = new Date(day);
      dateTime.setHours(Number.isInteger(hh) ? hh : 0, Number.isInteger(mm) ? mm : 0, 0, 0);
      if (dateTime.getTime() < now.getTime()) continue;

      const ts = Math.floor(dateTime.getTime() / 1000);
      const label = `${dateTime.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
      })} (${WEEKDAY_LABELS[dateTime.getDay()]}) в ${slot.from.slice(0, 5)}`;

      options.push({ value: ts, label });
    }
  }

  return options;
}
