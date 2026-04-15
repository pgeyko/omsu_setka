import type { Lesson } from '../api/client';
import { TIME_SLOTS } from '../api/client';

export interface BreakInfo {
  title: string;
  detail: string;
  variant: 'lesson' | 'between';
}

const parseSlotTime = (value: string) => {
  const [hours, minutes] = value.replace('.', ':').split(':').map(Number);
  return hours * 60 + minutes;
};

const getNowMinutes = (now: Date) => now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

const formatMinutesAsTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatMinutesLeft = (target: number, now: number) => Math.max(1, Math.ceil(target - now));

export const getBreakInfo = (lessons: Lesson[], now: Date, isToday: boolean): BreakInfo | null => {
  if (!isToday || lessons.length === 0) return null;

  const nowMinutes = getNowMinutes(now);
  const occupiedSlots = Array.from(new Set(lessons.map(lesson => lesson.time)))
    .filter(time => TIME_SLOTS[time])
    .sort((a, b) => a - b);

  for (const time of occupiedSlots) {
    const slot = TIME_SLOTS[time];
    const start = parseSlotTime(slot.start);
    const lessonBreakStart = start + 45;
    const lessonBreakEnd = lessonBreakStart + 5;

    if (nowMinutes >= lessonBreakStart && nowMinutes < lessonBreakEnd) {
      return {
        title: `Пара продолжится в ${formatMinutesAsTime(lessonBreakEnd)}`,
        detail: `Перерыв закончится через ${formatMinutesLeft(lessonBreakEnd, nowMinutes)} мин`,
        variant: 'lesson'
      };
    }

    if (nowMinutes >= lessonBreakStart - 15 && nowMinutes < lessonBreakStart) {
      return {
        title: `Перерыв в ${formatMinutesAsTime(lessonBreakStart)}`,
        detail: `Через ${formatMinutesLeft(lessonBreakStart, nowMinutes)} мин, на 5 минут`,
        variant: 'lesson'
      };
    }
  }

  for (let i = 0; i < occupiedSlots.length - 1; i += 1) {
    const currentSlot = TIME_SLOTS[occupiedSlots[i]];
    const nextSlot = TIME_SLOTS[occupiedSlots[i + 1]];
    const currentEnd = parseSlotTime(currentSlot.end);
    const nextStart = parseSlotTime(nextSlot.start);

    if (nextStart <= currentEnd) continue;

    if (nowMinutes >= currentEnd && nowMinutes < nextStart) {
      return {
        title: `Следующая пара в ${formatMinutesAsTime(nextStart)}`,
        detail: `Перерыв закончится через ${formatMinutesLeft(nextStart, nowMinutes)} мин`,
        variant: 'between'
      };
    }

    if (nowMinutes >= currentEnd - 15 && nowMinutes < currentEnd) {
      return {
        title: `Перерыв в ${formatMinutesAsTime(currentEnd)}`,
        detail: `Следующая пара в ${formatMinutesAsTime(nextStart)}`,
        variant: 'between'
      };
    }
  }

  return null;
};
