import type { Day, Lesson, ScheduleChange } from '../api/types';

export function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: 1,
    time: 1,
    faculty: 'ФМС',
    lesson: 'Физика',
    type_work: 'Лек',
    teacher: 'Смирнова А. П.',
    group: 'ЮСС-003-О-02',
    auditCorps: '1-102',
    publishDate: '2026-11-10',
    ...overrides,
  };
}

export function day(date: string, lessons: Lesson[]): Day {
  const [year, month, dayOfMonth] = date.split('-');
  return { day: `${dayOfMonth}.${month}.${year}`, date, lessons };
}

export function week(days: Array<[string, Lesson[]]>): Day[] {
  return days.map(([date, lessons]) => day(date, lessons));
}

export function change(overrides: Partial<ScheduleChange> = {}): ScheduleChange {
  return {
    id: 1,
    entity_type: 'group',
    entity_id: 12246,
    change_type: 'modified',
    lesson_id: 1,
    day: '2026-11-18',
    pair: 2,
    subgroup: '',
    subject: 'Математический анализ',
    changes: [{ field: 'teacher', label: 'преподаватель', old: 'Сидоров А. В.', new: 'Иванов И. И.' }],
    created_at: '2026-11-18T06:30:00Z',
    ...overrides,
  };
}

export const WEEK_START = '2026-11-16';
export const WEEK_DATES = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];

export function sampleWeek(): Day[] {
  return week([
    [
      '2026-11-16',
      [
        lesson({ id: 101, time: 1, lesson: 'Физика', type_work: 'Лек' }),
        lesson({ id: 102, time: 2, lesson: 'Математический анализ', type_work: 'Прак', teacher: 'Иванов И. И.' }),
        lesson({ id: 103, time: 4, lesson: 'Программирование', type_work: 'Лаб', auditCorps: '4-308', teacher: 'Кузнецов Д. С.' }),
      ],
    ],
    [
      '2026-11-17',
      [
        lesson({ id: 201, time: 2, lesson: 'Теория вероятностей', teacher: 'Смирнова А. П.' }),
        lesson({ id: 202, time: 3, lesson: 'Иностранный язык', type_work: 'Прак', auditCorps: '11-204', teacher: 'Орлова Н. С.' }),
      ],
    ],
    [
      '2026-11-18',
      [
        lesson({ id: 301, time: 1, lesson: 'Физика', type_work: 'Лек' }),
        lesson({ id: 302, time: 2, lesson: 'Математический анализ', type_work: 'Прак', teacher: 'Иванов И. И.' }),
        lesson({ id: 303, time: 4, lesson: 'Базы данных', type_work: 'Лаб', auditCorps: '4-308', teacher: 'Кузнецов Д. С.', subgroupName: 'ЮСС-003-О-02/1', subgroup_number: '1' }),
        lesson({ id: 304, time: 4, lesson: 'Иностранный язык', type_work: 'Прак', auditCorps: '11-204', teacher: 'Орлова Н. С.', subgroupName: 'ЮСС-003-О-02/2', subgroup_number: '2' }),
      ],
    ],
    [
      '2026-11-19',
      [
        lesson({ id: 401, time: 1, lesson: 'Математический анализ', type_work: 'Прак', teacher: 'Иванов И. И.' }),
        lesson({ id: 402, time: 3, lesson: 'Программирование', auditCorps: '4-308', teacher: 'Кузнецов Д. С.' }),
      ],
    ],
    [
      '2026-11-20',
      [
        lesson({ id: 501, time: 2, lesson: 'Теория вероятностей', type_work: 'Прак' }),
        lesson({ id: 502, time: 6, lesson: 'История России', type_work: 'Сем', auditCorps: '11-204', teacher: 'Петрова Е. В.' }),
      ],
    ],
    ['2026-11-21', [lesson({ id: 601, time: 1, lesson: 'Консультация по курсовой', type_work: 'Конс', auditCorps: '4-308', teacher: 'Кузнецов Д. С.' })]],
  ]);
}
