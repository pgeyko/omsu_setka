import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  addDaysISO,
  nextSchoolDay,
  currentWeekStart,
  dayHeading,
  relativeDate,
  weekRangeLabel,
  weekStartForDate,
} from './date';

describe('weekRangeLabel', () => {
  it('formats a range inside one month in genitive case', () => {
    expect(weekRangeLabel('2026-11-16')).toBe('16–21 ноября');
  });

  it('formats a range across months', () => {
    expect(weekRangeLabel('2026-03-30')).toBe('30 марта – 4 апреля');
  });

  it('formats a range across years', () => {
    expect(weekRangeLabel('2026-12-28')).toBe('28 декабря – 2 января');
  });
});

describe('addDaysISO', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDaysISO('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysISO('2026-11-16', 6)).toBe('2026-11-22');
  });
});

describe('nextSchoolDay', () => {
  it('moves to tomorrow and skips Sunday', () => {
    expect(nextSchoolDay('2026-11-19')).toBe('2026-11-20');
    expect(nextSchoolDay('2026-11-21')).toBe('2026-11-23');
    expect(nextSchoolDay('2026-11-22')).toBe('2026-11-23');
  });
});

describe('weekStartForDate', () => {
  it('maps any weekday to its Monday', () => {
    expect(weekStartForDate('2026-11-16')).toBe('2026-11-16');
    expect(weekStartForDate('2026-11-18')).toBe('2026-11-16');
    expect(weekStartForDate('2026-11-22')).toBe('2026-11-16');
  });
});

describe('currentWeekStart', () => {
  it('uses the date argument', () => {
    expect(currentWeekStart(new Date('2026-11-21T18:00:00'))).toBe('2026-11-16');
  });
});

describe('relative dates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels today and yesterday', () => {
    expect(relativeDate('2026-11-19')).toBe('Сегодня');
    expect(relativeDate('2026-11-18')).toBe('Вчера');
    expect(relativeDate('2026-11-17')).toBe('17 ноября');
  });

  it('builds change day headings with the date', () => {
    expect(dayHeading('2026-11-19')).toBe('Сегодня, 19 ноября');
    expect(dayHeading('2026-11-18')).toBe('Вчера, 18 ноября');
    expect(dayHeading('2026-11-17')).toBe('17 ноября');
  });

  it('returns the input for an invalid date', () => {
    expect(relativeDate('not-a-date')).toBe('not-a-date');
    expect(dayHeading('not-a-date')).toBe('not-a-date');
  });
});
