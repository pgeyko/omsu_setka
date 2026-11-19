import { isoDate, startOfWeek } from './schedule';

export function currentWeekStart(date = new Date()): string {
  return isoDate(startOfWeek(date));
}

export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(start);
  end.setDate(start.getDate() + 5);
  const monthOf = (date: Date) =>
    date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }).split(' ').slice(1).join(' ');
  const startMonth = monthOf(start);
  const endMonth = monthOf(end);
  if (startMonth === endMonth) return `${start.getDate()}–${end.getDate()} ${endMonth}`;
  return `${start.getDate()} ${startMonth} – ${end.getDate()} ${endMonth}`;
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function weekStartForDate(iso: string): string {
  return isoDate(startOfWeek(new Date(`${iso}T00:00:00`)));
}

export function dayHeading(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const label = relativeDate(iso);
  const formatted = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return label === 'Сегодня' || label === 'Вчера' ? `${label}, ${formatted}` : formatted;
}

export function relativeDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const today = new Date();
  const todayISO = isoDate(today);
  if (iso === todayISO) return 'Сегодня';
  const yesterday = addDaysISO(todayISO, -1);
  if (iso === yesterday) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
