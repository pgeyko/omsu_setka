import { describe, expect, it } from 'vitest';
import type { Lesson } from '../api/client';
import { getBreakInfo } from './scheduleBreaks';

const lesson = (time: number): Lesson => ({
  id: time,
  time,
  faculty: '',
  lesson: `Lesson ${time}`,
  type_work: 'Лекция',
  teacher: '',
  group: '',
  auditCorps: '',
  publishDate: ''
});

const at = (time: string) => new Date(`2026-04-15T${time}:00`);

describe('getBreakInfo', () => {
  it('does not show breaks for non-current days', () => {
    expect(getBreakInfo([lesson(1)], at('09:20'), false)).toBeNull();
  });

  it('shows upcoming in-lesson break with exact start time', () => {
    expect(getBreakInfo([lesson(1)], at('09:20'), true)).toEqual({
      title: 'Перерыв в 09:30',
      detail: 'Через 10 мин, на 5 минут',
      variant: 'lesson'
    });
  });

  it('shows active in-lesson break with exact resume time', () => {
    expect(getBreakInfo([lesson(1)], at('09:32'), true)).toEqual({
      title: 'Пара продолжится в 09:35',
      detail: 'Перерыв закончится через 3 мин',
      variant: 'lesson'
    });
  });

  it('shows upcoming break between occupied slots with next lesson time', () => {
    expect(getBreakInfo([lesson(1), lesson(3)], at('10:10'), true)).toEqual({
      title: 'Перерыв в 10:20',
      detail: 'Следующая пара в 12:45',
      variant: 'between'
    });
  });

  it('shows active break between occupied slots with exact next lesson time', () => {
    expect(getBreakInfo([lesson(1), lesson(2)], at('10:24'), true)).toEqual({
      title: 'Следующая пара в 10:30',
      detail: 'Перерыв закончится через 6 мин',
      variant: 'between'
    });
  });

  it('does not show a break when the next relevant event is too far away', () => {
    expect(getBreakInfo([lesson(1), lesson(2)], at('09:00'), true)).toBeNull();
  });
});
