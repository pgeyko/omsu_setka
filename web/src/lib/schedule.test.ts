import { describe, expect, it } from 'vitest';
import {
  buildingOf,
  cleanSubject,
  dayLabel,
  dayMonthLabel,
  isoDate,
  lessonCountLabel,
  lessonDate,
  lessonSubgroup,
  matchesSubgroup,
  variantCountLabel,
  normalizeSubgroup,
  plural,
  roomOf,
  shortDay,
  slotsOf,
  subgroupLabel,
  todayISO,
  typeLabel,
  weekDays,
  weekdayFull,
  weekdayTitle,
  startOfWeek,
  TIME_SLOTS,
  type SlotEntry,
} from './schedule';
import type { Day } from '../api/types';
import { lesson } from '../test/fixtures';

const noChanges = new Set<number>();

function singleDay(overrides: Parameters<typeof lesson>[0] = {}): Day {
  return {
    day: '18.11.2026',
    date: '2026-11-18',
    lessons: [lesson({ id: 1, time: 3, ...overrides })],
  };
}

describe('normalizeSubgroup', () => {
  it('extracts the number after a slash', () => {
    expect(normalizeSubgroup('ЮСС-003-О-02/2')).toBe('2');
  });

  it('handles wording before and after the number', () => {
    expect(normalizeSubgroup('подгруппа 1')).toBe('1');
    expect(normalizeSubgroup('2 подгруппа')).toBe('2');
    expect(normalizeSubgroup('2 п/г')).toBe('2');
    expect(normalizeSubgroup(' 1 ')).toBe('1');
  });

  it('returns an empty string for missing or unknown values', () => {
    expect(normalizeSubgroup(undefined)).toBe('');
    expect(normalizeSubgroup(null)).toBe('');
    expect(normalizeSubgroup('')).toBe('');
    expect(normalizeSubgroup('вся группа')).toBe('');
  });
});

describe('typeLabel', () => {
  it('maps known type work to readable labels', () => {
    expect(typeLabel('Лек')).toBe('лекция');
    expect(typeLabel('Практическое занятие')).toBe('практика');
    expect(typeLabel('Лабораторная')).toBe('лабораторная');
    expect(typeLabel('Семинар')).toBe('семинар');
    expect(typeLabel('Консультация')).toBe('консультация');
  });

  it('falls back to the source value or a generic label', () => {
    expect(typeLabel('Зачёт')).toBe('Зачёт');
    expect(typeLabel(undefined)).toBe('занятие');
  });
});

describe('cleanSubject', () => {
  it('strips a trailing lesson type suffix', () => {
    expect(cleanSubject(lesson({ lesson: 'Физика лек' }))).toBe('Физика');
    expect(cleanSubject(lesson({ lesson: 'Математика прак' }))).toBe('Математика');
    expect(cleanSubject(lesson({ lesson: 'История сем' }))).toBe('История');
  });

  it('keeps subjects without a suffix and trims spaces', () => {
    expect(cleanSubject(lesson({ lesson: '  Базы данных  ' }))).toBe('Базы данных');
    expect(cleanSubject(lesson({ lesson: 'Физика' }))).toBe('Физика');
  });
});

describe('buildingOf and roomOf', () => {
  it('prefers derived fields from the API', () => {
    expect(buildingOf(lesson({ building: '4', auditCorps: '1-102' }))).toBe('4');
    expect(roomOf(lesson({ room: '308', auditCorps: '1-102' }))).toBe('308');
  });

  it('parses the legacy auditCorps format', () => {
    expect(buildingOf(lesson({ auditCorps: '4-308' }))).toBe('4');
    expect(buildingOf(lesson({ auditCorps: '(11-204)' }))).toBe('11');
    expect(roomOf(lesson({ auditCorps: '4-308' }))).toBe('308');
    expect(roomOf(lesson({ auditCorps: '4-308*' }))).toBe('308');
    expect(roomOf(lesson({ auditCorps: 'кафедра' }))).toBe('кафедра');
  });

  it('ignores the unknown building 0 but parses the room prefix', () => {
    expect(buildingOf(lesson({ building: '0', auditCorps: '(6-31) Фитнесс зал' }))).toBe('6');
    expect(buildingOf(lesson({ building: '0', auditCorps: 'Д-2/16' }))).toBe('');
  });
});

describe('lessonSubgroup', () => {
  it('prefers the normalized field and falls back to the raw name', () => {
    expect(lessonSubgroup(lesson({ subgroup_number: '1', subgroupName: 'ГР/2' }))).toBe('1');
    expect(lessonSubgroup(lesson({ subgroupName: 'ГР/2' }))).toBe('2');
    expect(lessonSubgroup(lesson())).toBe('');
  });
});

describe('lessonDate', () => {
  it('uses the ISO date when present', () => {
    expect(lessonDate({ day: '18.11.2026', date: '2026-11-18', lessons: [] })).toBe('2026-11-18');
  });

  it('converts the legacy day format', () => {
    expect(lessonDate({ day: '18.11.2026', lessons: [] })).toBe('2026-11-18');
  });

  it('returns the source value when nothing matches', () => {
    expect(lessonDate({ day: 'среда', lessons: [] })).toBe('среда');
  });
});

describe('date labels', () => {
  it('formats a full day label', () => {
    expect(dayLabel('2026-11-18')).toBe('Среда, 18 ноября');
  });

  it('formats weekday title and month label', () => {
    expect(weekdayTitle('2026-11-18')).toBe('Среда');
    expect(weekdayFull('2026-11-18')).toBe('среда');
    expect(dayMonthLabel('2026-11-18')).toBe('18 ноября');
  });

  it('builds a short day cell', () => {
    const info = shortDay('2026-11-18');
    expect(info.weekday).toBe('ср');
    expect(info.day).toBe('18');
    expect(info.today).toBe('2026-11-18' === todayISO());
  });
});

describe('week helpers', () => {
  it('starts the week on Monday', () => {
    expect(isoDate(startOfWeek(new Date('2026-11-18T12:00:00')))).toBe('2026-11-16');
    expect(isoDate(startOfWeek(new Date('2026-11-22T12:00:00')))).toBe('2026-11-16');
    expect(isoDate(startOfWeek(new Date('2026-11-16T00:00:00')))).toBe('2026-11-16');
  });

  it('returns six days from Monday to Saturday', () => {
    expect(weekDays('2026-11-16')).toEqual([
      '2026-11-16',
      '2026-11-17',
      '2026-11-18',
      '2026-11-19',
      '2026-11-20',
      '2026-11-21',
    ]);
  });

  it('crosses a month boundary', () => {
    expect(weekDays('2026-03-30')[5]).toBe('2026-04-04');
  });
});

describe('subgroup filtering', () => {
  it('keeps everything when no subgroup is selected', () => {
    expect(matchesSubgroup(lesson({ subgroup_number: '2' }), '')).toBe(true);
  });

  it('keeps common lessons and the selected subgroup', () => {
    expect(matchesSubgroup(lesson(), '1')).toBe(true);
    expect(matchesSubgroup(lesson({ subgroup_number: '1' }), '1')).toBe(true);
    expect(matchesSubgroup(lesson({ subgroup_number: '2' }), '1')).toBe(false);
  });
});

describe('slotsOf', () => {
  it('returns no slots for an empty day', () => {
    expect(slotsOf({ day: '18.11.2026', lessons: [] }, '', noChanges)).toEqual([]);
  });

  it('maps a lesson to its pair and time slot', () => {
    const slots = slotsOf(singleDay({ time: 3 }), '', noChanges);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      pair: 3,
      start: TIME_SLOTS[3].start,
      end: TIME_SLOTS[3].end,
      window: false,
    });
    expect(slots[0].entries[0]).toMatchObject({
      subject: 'Физика',
      kind: 'лекция',
      teacher: 'Смирнова А. П.',
      room: '1-102',
      building: '1',
      subgroups: [],
      changed: false,
    });
  });

  it('fills gaps between lessons with windows', () => {
    const dayWithGap: Day = {
      day: '18.11.2026',
      lessons: [lesson({ id: 1, time: 1 }), lesson({ id: 2, time: 3, lesson: 'История', type_work: 'Сем' })],
    };
    const slots = slotsOf(dayWithGap, '', noChanges);
    expect(slots.map((slot) => slot.pair)).toEqual([1, 2, 3]);
    expect(slots[1]).toMatchObject({ window: true, entries: [] });
  });

  it('merges duplicate lessons and collects their subgroups', () => {
    const merged: Day = {
      day: '18.11.2026',
      lessons: [
        lesson({ id: 1, time: 4, subgroup_number: '1', subgroupName: 'ГР/1' }),
        lesson({ id: 2, time: 4, subgroup_number: '2', subgroupName: 'ГР/2' }),
      ],
    };
    const slots = slotsOf(merged, '', noChanges);
    expect(slots).toHaveLength(1);
    expect(slots[0].entries).toHaveLength(1);
    expect(slots[0].entries[0].subgroups).toEqual(['1', '2']);
    expect(slots[0].entries[0].id).toBe(1);
  });

  it('merges parallel options with the same subject into variants', () => {
    const slots = slotsOf(
      {
        day: '18.11.2026',
        lessons: [
          lesson({ id: 1, time: 1, lesson: 'Физкультура', teacher: 'Иванов И. И.', auditCorps: '6-113' }),
          lesson({ id: 2, time: 1, lesson: 'Физкультура', teacher: 'Петров П. П.', auditCorps: '6-115' }),
        ],
      },
      '',
      noChanges,
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].entries).toHaveLength(1);
    expect(slots[0].entries[0].variants).toEqual([
      { teacher: 'Иванов И. И.', room: '6-113', building: '6' },
      { teacher: 'Петров П. П.', room: '6-115', building: '6' },
    ]);
    expect(slots[0].entries[0].teacher).toBe('Иванов И. И.');
  });

  it('keeps different subjects as separate entries', () => {
    const slots = slotsOf(
      {
        day: '18.11.2026',
        lessons: [
          lesson({ id: 1, time: 1, lesson: 'Физика' }),
          lesson({ id: 2, time: 1, lesson: 'История', type_work: 'Сем' }),
        ],
      },
      '',
      noChanges,
    );
    expect(slots[0].entries).toHaveLength(2);
  });

  it('does not merge lessons from different groups (tutor schedule)', () => {
    const slots = slotsOf(
      {
        day: '18.11.2026',
        lessons: [
          lesson({ id: 1, group: 'ГР-1', time: 2 }),
          lesson({ id: 2, group: 'ГР-2', time: 2 }),
        ],
      },
      '',
      noChanges,
    );
    expect(slots[0].entries).toHaveLength(2);
  });

  it('filters by subgroup but keeps common lessons', () => {
    const dayWithSubgroups: Day = {
      day: '18.11.2026',
      lessons: [
        lesson({ id: 1, time: 1 }),
        lesson({ id: 2, time: 2, lesson: 'Базы данных', subgroup_number: '1' }),
        lesson({ id: 3, time: 2, lesson: 'Иностранный язык', subgroup_number: '2' }),
      ],
    };
    const slots = slotsOf(dayWithSubgroups, '1', noChanges);
    expect(slots.flatMap((slot) => slot.entries.map((entry) => entry.subject))).toEqual([
      'Физика',
      'Базы данных',
    ]);
  });

  it('marks changed entries from the change feed', () => {
    const slots = slotsOf(singleDay({ id: 42 }), '', new Set([42]));
    expect(slots[0].entries[0].changed).toBe(true);
  });

  it('marks every merged entry that has a change', () => {
    const slots = slotsOf(
      {
        day: '18.11.2026',
        lessons: [
          lesson({ id: 1, time: 2, auditCorps: '1-102' }),
          lesson({ id: 2, time: 2, auditCorps: '1-103' }),
        ],
      },
      '',
      new Set([2]),
    );
    expect(slots[0].entries[0].changed).toBe(true);
  });

  it('ignores pairs beyond the supported range', () => {
    const slots = slotsOf(
      {
        day: '18.11.2026',
        lessons: [lesson({ id: 1, time: 9 })],
      },
      '',
      noChanges,
    );
    expect(slots).toEqual([]);
  });
});

describe('labels', () => {
  it('pluralizes lesson counts', () => {
    expect(lessonCountLabel(1)).toBe('1 занятие');
    expect(lessonCountLabel(2)).toBe('2 занятия');
    expect(lessonCountLabel(5)).toBe('5 занятий');
  });

  it('pluralizes variant counts', () => {
    expect(variantCountLabel(1)).toBe('1 вариант');
    expect(variantCountLabel(2)).toBe('2 варианта');
    expect(variantCountLabel(5)).toBe('5 вариантов');
  });

  it('builds subgroup labels', () => {
    const entry = { subgroups: ['1'] } as SlotEntry;
    expect(subgroupLabel(entry)).toBe('1-я подгруппа');
    expect(subgroupLabel({ subgroups: ['1', '2'] } as SlotEntry)).toBe('1-я, 2-я подгруппы');
    expect(subgroupLabel({ subgroups: [] } as unknown as SlotEntry)).toBe('');
  });

  it('handles Russian plural rules', () => {
    expect(plural(1, 'пара', 'пары', 'пар')).toBe('пара');
    expect(plural(2, 'пара', 'пары', 'пар')).toBe('пары');
    expect(plural(5, 'пара', 'пары', 'пар')).toBe('пар');
    expect(plural(11, 'пара', 'пары', 'пар')).toBe('пар');
    expect(plural(21, 'пара', 'пары', 'пар')).toBe('пара');
    expect(plural(22, 'пара', 'пары', 'пар')).toBe('пары');
  });
});
