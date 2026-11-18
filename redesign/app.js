/* ============================================================
   сетка — mockup data + rendering
   Everything below is synthetic demo data (real group/tutor
   formats from the API, invented names and lessons).
   ============================================================ */

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4 4" stroke-linecap="round"/></svg>',
  chevronDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 9.5 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m14.5 6-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chevronRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m9.5 6 6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke-linecap="round"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="1"/><path d="M3.5 9.5h17M8 3.5V7m8-3.5V7" stroke-linecap="round"/><circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none"/></svg>',
  week: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="16" rx="1"/><path d="M9.2 4.5v16M14.8 4.5v16M3.5 9.2h17" stroke-linecap="round"/></svg>',
  changes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h13l-3-3m6 11H7l3 3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke-linecap="round"/><circle cx="9" cy="7" r="2" fill="var(--surface)"/><circle cx="15" cy="12" r="2" fill="var(--surface)"/><circle cx="8" cy="17" r="2" fill="var(--surface)"/></svg>',
};

const TODAY_ISO = '2026-11-18';
const TEACHER_FULL = {
  'Иванов И. И.': 'Иванов Иван Иванович',
  'Смирнова А. П.': 'Смирнова Анна Петровна',
  'Кузнецов Д. С.': 'Кузнецов Дмитрий Сергеевич',
  'Петрова Е. В.': 'Петрова Елена Викторовна',
  'Орлова Н. С.': 'Орлова Наталья Сергеевна',
  'Белов С. Н.': 'Белов Сергей Николаевич',
  'Сидоров А. В.': 'Сидоров Алексей Викторович',
  'Волкова М. А.': 'Волкова Марина Анатольевна',
  'Иванова М. С.': 'Иванова Мария Сергеевна',
};
const NOW = { dayIndex: 2, pair: 2, time: '11:20', left: '35 мин', progress: 53 };

const WEEK = [
  {
    iso: '2026-11-16', wd: 'понедельник', short: 'пн', num: '16', month: 'ноября',
    lessons: [
      { pair: 1, start: '08:45', end: '10:20', subject: 'Физика', kind: 'лекция', room: '1-102', teacher: 'Смирнова А. П.' },
      { pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'практика', room: '1-102', teacher: 'Иванов И. И.' },
      { pair: 4, start: '14:30', end: '16:05', subject: 'Программирование', kind: 'лабораторная', room: '4-308', teacher: 'Кузнецов Д. С.' },
      { pair: 5, start: '16:15', end: '17:50', subject: 'История России', kind: 'семинар', room: '11-204', teacher: 'Петрова Е. В.' },
    ],
  },
  {
    iso: '2026-11-17', wd: 'вторник', short: 'вт', num: '17', month: 'ноября',
    lessons: [
      { pair: 2, start: '10:30', end: '12:05', subject: 'Теория вероятностей', kind: 'лекция', room: '6-115', teacher: 'Смирнова А. П.' },
      { pair: 3, start: '12:45', end: '14:20', subject: 'Иностранный язык', kind: 'практика', room: '11-204', teacher: 'Орлова Н. С.' },
      { pair: 4, start: '14:30', end: '16:05', subject: 'Базы данных', kind: 'лекция', room: '4-308', teacher: 'Кузнецов Д. С.' },
      { pair: 5, start: '16:15', end: '17:50', subject: 'Физика', kind: 'лабораторная', room: '1-102', teacher: 'Смирнова А. П.' },
    ],
  },
  {
    iso: '2026-11-18', wd: 'среда', short: 'ср', num: '18', month: 'ноября',
    lessons: [
      { pair: 1, start: '08:45', end: '10:20', subject: 'Физика', kind: 'лекция', room: '1-102', teacher: 'Смирнова А. П.' },
      { pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'практика', room: '1-102', teacher: 'Иванов И. И.' },
      { pair: 3, start: '12:45', end: '14:20', window: true },
      { pair: 4, start: '14:30', end: '16:05', subject: 'Базы данных', kind: 'лабораторная', room: '4-308', teacher: 'Кузнецов Д. С.', subgroup: '1 подгруппа', change: { from: '4-312', field: 'аудитория' } },
      { pair: 4, start: '14:30', end: '16:05', subject: 'Иностранный язык', kind: 'практика', room: '11-204', teacher: 'Орлова Н. С.', subgroup: '2 подгруппа' },
      { pair: 5, start: '16:15', end: '17:50', subject: 'История России', kind: 'семинар', room: '11-204', teacher: 'Петрова Е. В.' },
    ],
  },
  {
    iso: '2026-11-19', wd: 'четверг', short: 'чт', num: '19', month: 'ноября',
    lessons: [
      { pair: 1, start: '08:45', end: '10:20', subject: 'Математический анализ', kind: 'практика', room: '1-102', teacher: 'Иванов И. И.' },
      { pair: 3, start: '12:45', end: '14:20', subject: 'Программирование', kind: 'лекция', room: '4-308', teacher: 'Кузнецов Д. С.' },
      { pair: 4, start: '14:30', end: '16:05', subject: 'История России', kind: 'лекция', room: '11-204', teacher: 'Петрова Е. В.' },
      { pair: 5, start: '16:15', end: '17:50', subject: 'Физическая культура', kind: 'практика', room: '6-115', teacher: 'Белов С. Н.' },
    ],
  },
  {
    iso: '2026-11-20', wd: 'пятница', short: 'пт', num: '20', month: 'ноября',
    lessons: [
      { pair: 2, start: '10:30', end: '12:05', subject: 'Теория вероятностей', kind: 'практика', room: '6-115', teacher: 'Смирнова А. П.' },
      { pair: 3, start: '12:45', end: '14:20', subject: 'Иностранный язык', kind: 'практика', room: '11-204', teacher: 'Орлова Н. С.' },
      { pair: 4, start: '14:30', end: '16:05', subject: 'Базы данных', kind: 'лабораторная', room: '4-308', teacher: 'Кузнецов Д. С.', subgroup: '2 подгруппа' },
      { pair: 6, start: '18:00', end: '19:35', subject: 'История России', kind: 'семинар', room: '11-204', teacher: 'Петрова Е. В.' },
    ],
  },
  {
    iso: '2026-11-21', wd: 'суббота', short: 'сб', num: '21', month: 'ноября',
    lessons: [
      { pair: 1, start: '08:45', end: '10:20', subject: 'Консультация по курсовой', kind: 'консультация', room: '4-308', teacher: 'Кузнецов Д. С.' },
      { pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'лекция', room: '1-102', teacher: 'Иванов И. И.' },
    ],
  },
];

const NEXT_WEEK = [
  { iso: '2026-11-23', wd: 'понедельник', short: 'пн', num: '23', month: 'ноября', lessons: [
    { pair: 1, start: '08:45', end: '10:20', subject: 'Физика', kind: 'лекция', room: '1-102', teacher: 'Смирнова А. П.' },
    { pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'практика', room: '1-102', teacher: 'Иванов И. И.' },
  ]},
  { iso: '2026-11-24', wd: 'вторник', short: 'вт', num: '24', month: 'ноября', lessons: [
    { pair: 3, start: '12:45', end: '14:20', subject: 'Иностранный язык', kind: 'практика', room: '11-204', teacher: 'Орлова Н. С.' },
  ]},
  { iso: '2026-11-25', wd: 'среда', short: 'ср', num: '25', month: 'ноября', lessons: [
    { pair: 2, start: '10:30', end: '12:05', subject: 'Базы данных', kind: 'лекция', room: '4-308', teacher: 'Кузнецов Д. С.' },
  ]},
  { iso: '2026-11-26', wd: 'четверг', short: 'чт', num: '26', month: 'ноября', lessons: [] },
  { iso: '2026-11-27', wd: 'пятница', short: 'пт', num: '27', month: 'ноября', lessons: [] },
  { iso: '2026-11-28', wd: 'суббота', short: 'сб', num: '28', month: 'ноября', lessons: [] },
];

function cloneWeek(week) {
  return week.map((day) => ({
    ...day,
    lessons: day.lessons.map((lesson) => ({
      ...lesson,
      change: lesson.change ? { ...lesson.change } : undefined,
    })),
  }));
}

function patchWeek(week, apply) {
  const copy = cloneWeek(week);
  apply(copy);
  return copy;
}

const GROUPS = [
  {
    id: 12246,
    name: 'ЮСС-003-О-02',
    current: WEEK,
    next: NEXT_WEEK,
  },
  {
    id: 12190,
    name: 'ЮСС-002-О-01',
    current: patchWeek(WEEK, (week) => {
      week[0].lessons[0] = { ...week[0].lessons[0], subject: 'Информатика', teacher: 'Сидоров А. В.', room: '4-308' };
      week[2].lessons[1] = { ...week[2].lessons[1], subject: 'Дискретная математика', teacher: 'Сидоров А. В.' };
      week[2].lessons.forEach((lesson) => { if (lesson.pair === 4) delete lesson.change; });
    }),
    next: cloneWeek(NEXT_WEEK),
  },
  {
    id: 12087,
    name: 'ЮСС-001-О-03',
    current: patchWeek(WEEK, (week) => {
      week[0].lessons[1] = { ...week[0].lessons[1], subject: 'Дискретная математика', teacher: 'Иванова М. С.' };
      week[2].lessons[1] = { ...week[2].lessons[1], subject: 'Теория чисел', teacher: 'Иванова М. С.' };
      week[2].lessons.forEach((lesson) => { if (lesson.pair === 4) delete lesson.change; });
    }),
    next: cloneWeek(NEXT_WEEK),
  },
  {
    id: 12804,
    name: 'МЕН-004-О-02',
    current: patchWeek(WEEK, (week) => {
      week[0].lessons[0] = { ...week[0].lessons[0], subject: 'Экономика', teacher: 'Волкова М. А.', room: '11-204' };
      week[1].lessons[2] = { ...week[1].lessons[2], subject: 'Бухгалтерский учёт', teacher: 'Волкова М. А.' };
      week[2].lessons[1] = { ...week[2].lessons[1], subject: 'Статистика', teacher: 'Волкова М. А.' };
      week[2].lessons.forEach((lesson) => { if (lesson.pair === 4) delete lesson.change; });
    }),
    next: cloneWeek(NEXT_WEEK),
  },
];

function currentGroup() {
  return GROUPS.find((group) => group.id === state.groupId) || GROUPS[0];
}

function baseWeek() {
  return currentGroup().current;
}

const SEARCH_DATA = {
  groups: [
    { id: 472, name: 'ЮСС-003-О-02', realId: 12246 },
    { id: 468, name: 'ЮСС-002-О-01', realId: 12190 },
    { id: 451, name: 'ЮСС-001-О-03', realId: 12087 },
    { id: 512, name: 'МЕН-004-О-02', realId: 12804 },
  ],
  tutors: [
    { id: 15, name: 'Иванов Иван Иванович' },
    { id: 23, name: 'Иванова Мария Сергеевна' },
    { id: 31, name: 'Смирнова Анна Петровна' },
    { id: 44, name: 'Кузнецов Дмитрий Сергеевич' },
    { id: 52, name: 'Орлова Наталья Сергеевна' },
  ],
  auditories: [
    { id: 3024, name: '1-102', building: '1' },
    { id: 3310, name: '4-308', building: '4' },
    { id: 3901, name: '11-204', building: '11' },
    { id: 3711, name: '6-115', building: '6' },
  ],
};

const CHANGES = [
  { day: 'Сегодня, 18 ноября', iso: '2026-11-18', pair: 4, subject: 'Базы данных', kind: 'изменено', field: 'аудитория', from: '4-312', to: '4-308', subgroup: '1' },
  { day: 'Сегодня, 18 ноября', iso: '2026-11-18', pair: 2, subject: 'Математический анализ', kind: 'изменено', field: 'преподаватель', from: 'Сидоров А. В.', to: 'Иванов И. И.' },
  { day: 'Вчера, 17 ноября', iso: '2026-11-17', pair: 3, subject: 'Иностранный язык', kind: 'добавлено', text: 'пара появилась в расписании' },
  { day: '16 ноября', iso: '2026-11-16', pair: 6, subject: 'История России', kind: 'удалено', text: 'пара отменена' },
];

const TUTOR = {
  title: 'Иванов Иван Иванович',
  meta: 'преподаватель · 4 пары на этой неделе',
  lessons: [
    { day: 'пн', num: '16', pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'практика', room: '1-102', group: 'ЮСС-003-О-02' },
    { day: 'ср', num: '18', pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'практика', room: '1-102', group: 'ЮСС-003-О-02' },
    { day: 'чт', num: '19', pair: 1, start: '08:45', end: '10:20', subject: 'Математический анализ', kind: 'практика', room: '1-102', group: 'ЮСС-002-О-01' },
    { day: 'сб', num: '21', pair: 2, start: '10:30', end: '12:05', subject: 'Математический анализ', kind: 'лекция', room: '1-102', group: 'ЮСС-003-О-02' },
  ],
};

const AUDITORY = {
  title: '4-308',
  meta: 'аудитория · корпус 4 · 5 пар на этой неделе',
  lessons: [
    { day: 'пн', num: '16', pair: 4, start: '14:30', end: '16:05', subject: 'Программирование', kind: 'лабораторная', room: '4-308', group: 'ЮСС-003-О-02', teacher: 'Кузнецов Д. С.' },
    { day: 'вт', num: '17', pair: 4, start: '14:30', end: '16:05', subject: 'Базы данных', kind: 'лекция', room: '4-308', group: 'ЮСС-002-О-01', teacher: 'Кузнецов Д. С.' },
    { day: 'ср', num: '18', pair: 4, start: '14:30', end: '16:05', subject: 'Базы данных', kind: 'лабораторная', room: '4-308', group: 'ЮСС-003-О-02', teacher: 'Кузнецов Д. С.' },
    { day: 'чт', num: '19', pair: 3, start: '12:45', end: '14:20', subject: 'Программирование', kind: 'лекция', room: '4-308', group: 'ЮСС-003-О-02' },
    { day: 'сб', num: '21', pair: 1, start: '08:45', end: '10:20', subject: 'Консультация по курсовой', kind: 'консультация', room: '4-308', group: 'ЮСС-003-О-02', teacher: 'Кузнецов Д. С.' },
  ],
};

const state = {
  route: '',
  selectedDay: 2,
  query: '',
  changeFilter: 'group',
  weekOffset: 0,
  groupId: (() => {
    try {
      const saved = Number(localStorage.getItem('setka-group'));
      return GROUPS.some((group) => group.id === saved) ? saved : GROUPS[0].id;
    } catch (e) { return GROUPS[0].id; }
  })(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  subgroup: (() => {
    try {
      const saved = localStorage.getItem('setka-subgroup') || '';
      return ['1', '2'].includes(saved) ? saved : '';
    } catch (e) { return ''; }
  })(),
  theme: (() => {
    try { return localStorage.getItem('setka-theme') || 'system'; } catch (e) { return 'system'; }
  })(),
  notify: (() => {
    const defaults = {
      changes: true,
      digest: true,
      digestTime: '19:00',
      reminder: false,
      minutes: '30',
      timezone: 'Asia/Omsk',
    };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem('setka-notify') || '{}') };
    } catch (e) { return defaults; }
  })(),
};

/* ------------------------------- helpers ------------------------------- */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const THEMES = [
  ['light', 'Светлая'],
  ['dark', 'Тёмная'],
  ['system', 'Системная'],
];

function themeBlock() {
  return `
    <div class="setting-block">
      <span class="setting-label">Тема</span>
      <p class="setting-desc">Светлая, тёмная или как в системе.</p>
      <div class="segmented" role="group" aria-label="Тема оформления">
        ${THEMES.map(([value, label]) => `<button type="button" data-theme-opt="${value}" aria-pressed="${state.theme === value}">${label}</button>`).join('')}
      </div>
    </div>`;
}

function applyTheme() {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolved = state.theme === 'dark' || (state.theme === 'system' && systemDark) ? 'dark' : 'light';
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolved === 'dark' ? '#131814' : '#F7F8F3');
}

function setTheme(pref) {
  state.theme = pref;
  try { localStorage.setItem('setka-theme', pref); } catch (e) { /* приватный режим */ }
  applyTheme();
  document.querySelectorAll('[data-theme-opt]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.themeOpt === pref));
  });
}

function markSaved(root) {
  const status = root.querySelector('[data-save-status]');
  if (!status) return;
  status.textContent = 'Сохранено';
  try {
    localStorage.setItem('setka-notify', JSON.stringify(state.notify));
    localStorage.setItem('setka-subgroup', state.subgroup);
  } catch (e) { /* приватный режим */ }
  clearTimeout(markSaved.timer);
  markSaved.timer = setTimeout(() => {
    status.textContent = 'Изменения сохраняются автоматически';
  }, 1800);
}

const normalize = (s) => String(s).toLowerCase().replace(/ё/g, 'е').replace(/[-\s.]/g, '');

function dayLabel(d) {
  return `${d.wd[0].toUpperCase()}${d.wd.slice(1)}, ${Number(d.num)} ${d.month}`;
}

function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

// Same logic as the current frontend: lessons inside one pair are merged only
// when subject, type, teacher and room match. Different subgroups of the same
// lesson become one entry with several subgroups.
function mergeEntries(rawLessons) {
  const map = new Map();
  rawLessons.filter((l) => !l.window).forEach((l) => {
    const key = [l.subject, l.kind, l.teacher, l.room].join('|');
    if (map.has(key)) {
      const entry = map.get(key);
      if (l.subgroup && !entry.subgroups.includes(l.subgroup)) entry.subgroups.push(l.subgroup);
      if (l.change && !entry.change) entry.change = l.change;
    } else {
      map.set(key, { ...l, subgroups: l.subgroup ? [l.subgroup] : [] });
    }
  });
  return Array.from(map.values());
}

function slotOf(day, pair) {
  const raw = day.lessons.filter((l) => l.pair === pair && (l.window || matchesSubgroup(l)));
  const entries = mergeEntries(raw);
  const gap = raw.find((l) => l.window) || null;
  const sample = entries[0] || gap;
  return {
    pair,
    date: day.iso,
    entries,
    window: !entries.length && Boolean(gap),
    start: sample ? sample.start : '',
    end: sample ? sample.end : '',
  };
}

function slotsOf(day) {
  const pairs = Array.from(new Set(day.lessons.map((l) => l.pair))).sort((a, b) => a - b);
  return pairs.map((pair) => slotOf(day, pair));
}

function subgroupLabel(entry) {
  if (!entry.subgroups || entry.subgroups.length === 0) return '';
  if (entry.subgroups.length === 1) return entry.subgroups[0];
  const nums = entry.subgroups.map((s) => s.replace(/\s*подгруппа$/, ''));
  return `${nums.join(', ')} подгруппы`;
}

function buildingOf(room) {
  const match = String(room || '').match(/^(\d+)-/);
  return match ? match[1] : '';
}

function teacherFull(name) {
  return TEACHER_FULL[name] || name || '';
}

function slotHasChange(slot) {
  return slot.entries.some((e) => e.change);
}

function allDays() {
  const group = currentGroup();
  return group.current.concat(group.next);
}

function setGroup(id) {
  const group = GROUPS.find((g) => g.id === Number(id));
  if (!group) return;
  state.groupId = group.id;
  state.weekOffset = 0;
  state.selectedDay = NOW.dayIndex;
  try { localStorage.setItem('setka-group', String(group.id)); } catch (e) { /* приватный режим */ }
  render();
}

function applySubgroup(value) {
  state.subgroup = value;
  try { localStorage.setItem('setka-subgroup', value); } catch (e) { /* приватный режим */ }
  document.querySelectorAll('[data-subgroup-text]').forEach((el) => {
    if (!value) { el.textContent = ''; return; }
    el.textContent = el.dataset.subgroupText === 'prefix' ? `подгруппа ${value} · ` : ` · подгруппа ${value}`;
  });
  document.querySelectorAll('[data-subgroup-link]').forEach((el) => {
    el.textContent = value ? `· подгруппа ${value}` : '';
  });
  document.querySelectorAll('select[name="subgroup"]').forEach((select) => {
    select.value = value;
  });
}

function setSubgroup(value) {
  applySubgroup(value);
  render();
}

function sheetEntry(entry, slot, day) {
  const sub = subgroupLabel(entry);
  const building = buildingOf(entry.room);
  const change = entry.change || null;
  const isNow = day.iso === TODAY_ISO && slot.pair === NOW.pair;
  const changedTo = change
    ? (change.field === 'преподаватель' ? teacherFull(entry.teacher) : entry.room)
    : '';
  const changeLabel = change
    ? (change.field === 'преподаватель' ? 'Замена преподавателя' : 'Замена аудитории')
    : '';

  return `
    <article class="sheet-lesson">
      <div class="sheet-lesson-top">
        <h3>${esc(entry.subject)}</h3>
        ${isNow ? '<span class="now-chip">сейчас</span>' : ''}
        ${change ? '<span class="change-flag">замена</span>' : ''}
      </div>
      <p class="sheet-kind">${esc(entry.kind)}${sub ? ` · ${esc(sub)}` : ''}</p>
      <dl class="sheet-facts">
        <div><dt>Преподаватель</dt><dd>${esc(teacherFull(entry.teacher))}</dd></div>
        <div><dt>Аудитория</dt><dd>${esc(entry.room)}${building ? ` · корпус ${esc(building)}` : ''}</dd></div>
        <div><dt>Группа</dt><dd>${esc(currentGroup().name)}</dd></div>
        ${sub ? `<div><dt>Подгруппа</dt><dd>${esc(sub)}</dd></div>` : ''}
      </dl>
      ${change ? `<p class="sheet-change">${changeLabel}: <del>${esc(change.from)}</del> <span aria-hidden="true">→</span> <ins>${esc(changedTo)}</ins></p>` : ''}
      <div class="sheet-actions">
        ${entry.teacher ? '<a href="#/tutor" data-close-sheet>Расписание преподавателя</a>' : ''}
        ${entry.room ? `<a href="#/auditory" data-close-sheet>Аудитория ${esc(entry.room)}</a>` : ''}
      </div>
    </article>`;
}

function sheetMarkup(day, slot) {
  const count = slot.entries.length;
  const rooms = new Set(slot.entries.map((e) => e.room));
  const teachers = new Set(slot.entries.map((e) => e.teacher).filter(Boolean));
  const diff = [];
  if (rooms.size > 1) diff.push('разные аудитории');
  if (teachers.size > 1) diff.push(`${teachers.size} ${plural(teachers.size, 'преподаватель', 'преподавателя', 'преподавателей')}`);
  const subParts = [dayLabel(day)];
  if (count > 1) subParts.push(`${count} ${plural(count, 'занятие', 'занятия', 'занятий')}`);
  if (diff.length) subParts.push(diff.join(' · '));

  return `
    <header class="sheet-head">
      <div class="sheet-head-text">
        <h2 class="sheet-title" id="sheet-title">${slot.pair} пара · ${slot.start}–${slot.end}</h2>
        <p class="sheet-sub">${subParts.map(esc).join(' · ')}</p>
      </div>
      <button class="sheet-close" type="button" data-close-sheet aria-label="Закрыть детали">${ICONS.close}</button>
    </header>
    <div class="sheet-scroll">
      ${count ? `<div class="sheet-list">${slot.entries.map((entry) => sheetEntry(entry, slot, day)).join('')}</div>` : '<p class="window-text" style="padding:16px 0">В это время пары нет.</p>'}
      <p class="sheet-foot">Данные из кэша · обновлено 2 минуты назад</p>
    </div>`;
}

function openSlot(dayIso, pair) {
  const day = allDays().find((d) => d.iso === dayIso);
  if (!day) return;
  const slot = slotOf(day, pair);
  if (!slot.entries.length && !slot.window) return;
  const dialog = document.getElementById('slot-sheet');
  if (!dialog) return;
  if (dialog.open) dialog.close();
  dialog.innerHTML = sheetMarkup(day, slot);
  dialog.showModal();
  document.body.classList.add('sheet-open');
  dialog.querySelectorAll('[data-close-sheet]').forEach((el) => {
    el.addEventListener('click', () => dialog.close());
  });
}

function closeSheet() {
  const dialog = document.getElementById('slot-sheet');
  if (dialog && dialog.open) dialog.close();
}

function weekData() {
  const group = currentGroup();
  return state.weekOffset === 1 ? group.next : group.current;
}

function subgroupNumbers() {
  const numbers = new Set();
  currentGroup().current.forEach((day) => {
    day.lessons.forEach((lesson) => {
      const match = String(lesson.subgroup || '').match(/^(\d+)/);
      if (match) numbers.add(match[1]);
    });
  });
  return Array.from(numbers).sort((a, b) => Number(a) - Number(b));
}

function matchesSubgroup(lesson) {
  if (!state.subgroup) return true;
  if (!lesson.subgroup) return true;
  const match = String(lesson.subgroup).match(/^(\d+)/);
  return Boolean(match) && match[1] === state.subgroup;
}

function routeOf() {
  return (location.hash || '').replace(/^#\/?/, '') || '';
}

function offlineBar() {
  return `
    <div class="offline-bar" role="status">
      <i class="dot is-stale"></i>Нет сети · данные от 2 минут назад
    </div>`;
}

/* ------------------------------- mobile ------------------------------- */

function mTop(showGroup = true) {
  return `
    <header class="m-top">
      <div class="m-top-row">
        <a class="brand" href="#/today" aria-label="сетка — на главную">сетка<span class="brand-dot"></span></a>
        <a class="icon-btn" href="#/search" aria-label="Найти группу, преподавателя или аудиторию">${ICONS.search}</a>
      </div>
      ${showGroup ? `<div class="m-group-row">
        <div>
          <span class="m-group-label">группа <a class="subgroup-link" href="#/settings" data-subgroup-link>${state.subgroup ? `· подгруппа ${state.subgroup}` : ''}</a></span>
          <a class="m-group-name" href="#/search">${esc(currentGroup().name)}${ICONS.chevronDown}</a>
        </div>
        <span class="freshness"><i class="dot"></i>2 мин назад</span>
      </div>` : ''}
    </header>`;
}

function dayStrip() {
  return `
    <div class="daystrip" role="group" aria-label="День недели">
      ${baseWeek().map((d, i) => `
        <button class="day-cell" type="button" aria-pressed="${i === state.selectedDay}" data-day="${i}">
          <span class="day-name">${d.short}</span>
          <span class="day-num">${d.num}</span>
          ${d.iso === TODAY_ISO ? '<span class="today-mark" aria-hidden="true"></span>' : ''}
        </button>`).join('')}
    </div>`;
}

function nowBand(day) {
  const nowLesson = day.lessons.find((l) => l.pair === NOW.pair && !l.window);
  return `
    <section class="now-band" aria-label="Сейчас идёт">
      <div class="now-head">
        <span class="now-chip">сейчас</span>
        <span class="now-slot">${nowLesson.pair} пара · ${nowLesson.start}–${nowLesson.end}</span>
        <button class="now-detail" type="button" data-day-iso="${day.iso}" data-slot="${nowLesson.pair}" aria-haspopup="dialog">Детали ${ICONS.chevronRight}</button>
      </div>
      <h1 class="now-subject">${esc(nowLesson.subject)}</h1>
      <p class="now-meta">${esc(nowLesson.kind)} · ауд. <b>${esc(nowLesson.room)}</b> · ${esc(nowLesson.teacher)}</p>
      <p class="now-left">до конца ${NOW.left}</p>
      <span class="now-progress" aria-hidden="true"><i style="width:${NOW.progress}%"></i></span>
    </section>`;
}

function dayBand(day) {
  const slots = slotsOf(day).filter((s) => s.entries.length);
  const first = slots[0];
  const last = slots[slots.length - 1];
  return `
    <section class="now-band" aria-label="${esc(dayLabel(day))}">
      <div class="now-head">
        <span class="now-chip">${esc(day.short)}</span>
        <span class="now-slot">${Number(day.num)} ${day.month}</span>
      </div>
      <h1 class="now-subject">${day.wd[0].toUpperCase()}${day.wd.slice(1)}</h1>
      <p class="now-meta">${slots.length} ${plural(slots.length, 'пара', 'пары', 'пар')}${first ? ` · ${first.start}–${last.end}` : ''} · <b>${esc(currentGroup().name)}</b></p>
      <p class="now-left">${first ? `первая пара в ${first.start}` : 'выходной'}</p>
    </section>`;
}

function slotRow(slot) {
  if (slot.window) {
    return `
      <li class="lesson is-window">
        <div class="time-col"><span class="pair-no">${slot.pair}</span><span class="t">${slot.start}</span><span class="t">${slot.end}</span></div>
        <p class="window-text">окно · 1 ч 35 мин <span>— можно успеть в столовую</span></p>
      </li>`;
  }

  const isMerged = slot.entries.length > 1;
  const change = slotHasChange(slot);
  const aria = isMerged
    ? `${slot.pair} пара, ${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}, открыть детали`
    : `${slot.pair} пара, ${slot.entries[0].subject}, открыть детали`;

  let body = '';
  if (isMerged) {
    const names = slot.entries.map((e) => e.subject);
    const rooms = Array.from(new Set(slot.entries.map((e) => e.room)));
    const teachers = Array.from(new Set(slot.entries.map((e) => e.teacher))).filter(Boolean);
    body = `
      <span class="lesson-top">
        <span class="subject">${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}</span>
        <span class="lesson-right">${change ? '<span class="change-flag">замена</span>' : ''}<span class="lesson-chevron">${ICONS.chevronRight}</span></span>
      </span>
      <span class="slot-line">${names.map(esc).join(' · ')}</span>
      <span class="meta">${rooms.map(esc).join(', ')}${teachers.length > 1 ? ` · ${teachers.length} преподавателя` : ''}</span>`;
  } else {
    const l = slot.entries[0];
    const meta = [`<span class="kind">${esc(l.kind)}</span>`];
    if (l.change) meta.push(`ауд. <s>${esc(l.change.from)}</s> → <b>${esc(l.room)}</b>`);
    else meta.push(`ауд. <b>${esc(l.room)}</b>`);
    if (l.teacher) meta.push(esc(l.teacher));
    const sub = subgroupLabel(l);
    body = `
      <span class="lesson-top">
        <span class="subject">${esc(l.subject)}</span>
        <span class="lesson-right">${l.change ? '<span class="change-flag">замена</span>' : ''}<span class="lesson-chevron">${ICONS.chevronRight}</span></span>
      </span>
      <span class="meta">${meta.join(' · ')}</span>
      ${sub ? `<span class="chip">${esc(sub)}</span>` : ''}`;
  }

  return `
    <li>
      <button class="lesson lesson-btn" type="button" data-day-iso="${slot.date}" data-slot="${slot.pair}"
              aria-haspopup="dialog" aria-label="${esc(aria)}">
        <span class="time-col"><span class="pair-no">${slot.pair}</span><span class="t">${slot.start}</span><span class="t">${slot.end}</span></span>
        <span class="lesson-body">${body}</span>
      </button>
    </li>`;
}

function renderToday() {
  const day = baseWeek()[state.selectedDay];
  const isToday = day.iso === TODAY_ISO;
  const allSlots = slotsOf(day).filter((s) => s.entries.length || s.window);
  const list = isToday ? allSlots.filter((s) => s.pair > NOW.pair) : allSlots;
  const realCount = list.filter((s) => s.entries.length > 0).length;
  const windowCount = list.filter((s) => s.window).length;
  const countText = realCount
    ? `${realCount} ${plural(realCount, 'пара', 'пары', 'пар')}${windowCount ? ` и ${windowCount} окно` : ''}`
    : 'свободно';
  const last = list[list.length - 1];

  return `
    <main id="content">
      ${dayStrip()}
      ${isToday ? nowBand(day) : dayBand(day)}
      <div class="section-head">
        <h2 class="section-title">${isToday ? 'Дальше сегодня' : 'Все пары'}</h2>
        <span class="section-note">${isToday ? countText : (last ? `до ${last.end}` : 'свободно')}</span>
      </div>
      <ul class="lesson-list">
        ${list.length ? list.map(slotRow).join('') : `<li class="lesson"><div></div><p class="window-text">${state.subgroup ? `Для подгруппы ${state.subgroup} занятий нет. <button class="link-btn" type="button" data-subgroup-all>Показать все</button>` : 'На этот день занятий нет.'}</p></li>`}
      </ul>
      <p class="footnote">${isToday ? '1 и 2 пара уже прошли. ' : ''}Источник — eservice.omsu.ru. Нажмите на пару, чтобы увидеть преподавателя и аудиторию. <a href="#/changes">Что изменилось на этой неделе</a></p>
    </main>`;
}

function weekDayBlock(d, i) {
  const slots = slotsOf(d);
  return `
    <section class="wday ${d.iso === TODAY_ISO ? 'is-today' : ''}" aria-label="${esc(dayLabel(d))}">
      <div class="wday-head">
        <span class="wday-num">${d.num}</span>
        <span class="wday-name">${d.wd}</span>
        <span class="wday-date">${d.lessons.some((l) => l.change && (l.window || matchesSubgroup(l))) ? '<span class="change-flag">замена</span>' : ''}</span>
      </div>
      ${slots.filter((slot) => slot.entries.length || slot.window).length ? slots.filter((slot) => slot.entries.length || slot.window).map((slot) => {
        if (slot.window) {
          return `
            <div class="wrow">
              <span class="wrow-time">${slot.start}</span>
              <span class="wrow-subject" style="color:var(--muted)">окно</span>
              <span class="wrow-room">${slot.end}</span>
            </div>`;
        }
        const isMerged = slot.entries.length > 1;
        const change = slotHasChange(slot);
        if (isMerged) {
          const names = slot.entries.map((e) => e.subject).join(' · ');
          const rooms = Array.from(new Set(slot.entries.map((e) => e.room))).join(', ');
          return `
            <button class="wrow wrow-btn" type="button" data-day-iso="${d.iso}" data-slot="${slot.pair}" aria-haspopup="dialog"
                    aria-label="${slot.pair} пара, ${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}, открыть детали">
              <span class="wrow-time">${slot.start}</span>
              <span class="wrow-subject">${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}${change ? '<span class="change-flag">замена</span>' : ''}</span>
              <span class="wrow-room">${esc(rooms)}</span>
              <span class="wrow-sub">${esc(names)}</span>
              <span class="wrow-chevron" aria-hidden="true">${ICONS.chevronRight}</span>
            </button>`;
        }
        const l = slot.entries[0];
        return `
          <button class="wrow wrow-btn" type="button" data-day-iso="${d.iso}" data-slot="${slot.pair}" aria-haspopup="dialog"
                  aria-label="${slot.pair} пара, ${esc(l.subject)}, открыть детали">
            <span class="wrow-time">${slot.start}</span>
            <span class="wrow-subject">${esc(l.subject)}${l.change ? '<span class="change-flag">замена</span>' : ''}</span>
            <span class="wrow-room">${esc(l.room)}</span>
            <span class="wrow-sub">${esc(l.kind)}${subgroupLabel(l) ? ` · ${esc(subgroupLabel(l))}` : ''}</span>
            <span class="wrow-chevron" aria-hidden="true">${ICONS.chevronRight}</span>
          </button>`;
      }).join('') : `<div class="wrow"><span class="wrow-time">—</span><span class="wrow-subject" style="color:var(--muted)">${state.subgroup ? `нет занятий для подгруппы ${state.subgroup}. <button class="link-btn" type="button" data-subgroup-all>Показать все</button>` : 'занятий нет'}</span><span class="wrow-room"></span></div>`}
    </section>`;
}

function renderWeekMobile() {
  const week = weekData();
  return `
    <main id="content">
      <div class="week-head">
        <h1 class="week-range">${week[0].num}–${week[5].num} ноября</h1>
        <div class="week-arrows">
          <button class="arrow-btn" type="button" aria-label="Предыдущая неделя" data-week="-1" ${state.weekOffset === 0 ? 'disabled style="opacity:.4"' : ''}>${ICONS.chevronLeft}</button>
          <button class="arrow-btn" type="button" aria-label="Следующая неделя" data-week="1">${ICONS.chevronRight}</button>
        </div>
      </div>
      ${week.map((d, i) => weekDayBlock(d, i)).join('')}
      <p class="footnote">Неделя начинается с понедельника. <a href="#/settings">Настроить уведомления</a></p>
    </main>`;
}

const TYPE_LABEL = { group: 'группа', tutor: 'преподаватель', auditory: 'аудитория' };

function searchGroups(query) {
  const q = normalize(query);
  if (q.length < 2) return null;
  const pick = (arr) => arr.filter((x) => normalize(x.name).startsWith(q));
  return {
    groups: pick(SEARCH_DATA.groups),
    tutors: pick(SEARCH_DATA.tutors),
    auditories: pick(SEARCH_DATA.auditories),
  };
}

function renderResults() {
  const q = state.query.trim();
  if (q.length < 2) {
    return '';
  }
  const res = searchGroups(q);
  const total = res.groups.length + res.tutors.length + res.auditories.length;
  if (!total) {
    return `<p class="empty-search" role="status">Ничего не нашлось. Проверьте написание или попробуйте номер группы целиком.</p>`;
  }
  const block = (title, items, type) => items.length ? `
    <section class="result-group" aria-label="${title}">
      <div class="group-head"><h2 class="group-name">${title}</h2><span class="group-count">${items.length}</span></div>
      <ul class="result-list">
        ${items.map((it) => `
          <li><a class="result-row" href="${type === 'group' ? '#/today' : type === 'tutor' ? '#/tutor' : '#/auditory'}"${type === 'group' ? ` data-group="${it.realId}" data-group-target="#/today"` : ''}>
            <span class="result-name">${esc(it.name)}</span>
            <span class="result-type">${TYPE_LABEL[type]}</span>
          </a></li>`).join('')}
      </ul>
    </section>` : '';

  return `${block('Группы', res.groups, 'group')}${block('Преподаватели', res.tutors, 'tutor')}${block('Аудитории', res.auditories, 'auditory')}
    <p class="search-hint" role="status" style="padding:0 16px">${total} ${total === 1 ? 'результат' : total < 5 ? 'результата' : 'результатов'} по запросу «${esc(q)}»</p>`;
}

function renderSearchPage() {
  return `
    <div class="search-head">
      <div class="search-bar">
        <a class="search-back" href="#/today" aria-label="Назад">${ICONS.arrowLeft}</a>
        <div class="search-field">
          ${ICONS.search}
          <label class="sr-only" for="m-q">Поиск по группам, преподавателям и аудиториям</label>
          <input id="m-q" name="q" type="search" inputmode="search" autocomplete="off" spellcheck="false" enterkeyhint="search"
                 placeholder="Группа, преподаватель, аудитория" value="${esc(state.query)}">
          <button class="search-clear" type="button" data-clear ${state.query ? '' : 'hidden'}>Очистить</button>
        </div>
      </div>
      <p class="search-hint">Достаточно двух символов. Поиск идёт по началу названия.</p>
    </div>
    <main id="content">
      <h1 class="sr-only">Поиск</h1>
      <div id="m-search-results">${renderResults()}</div>
      <div id="search-recent" ${state.query.trim().length >= 2 ? 'hidden' : ''}>
        <div class="recent">
          <h2 class="recent-title">Недавние запросы</h2>
          <ul class="recent-list">
            <li><a class="recent-row" href="#/today" data-group="12246" data-group-target="#/today"><span>ЮСС-003-О-02</span><span>группа</span></a></li>
            <li><a class="recent-row" href="#/tutor"><span>Иванов</span><span>преподаватель</span></a></li>
            <li><a class="recent-row" href="#/auditory"><span>4-308</span><span>аудитория</span></a></li>
          </ul>
        </div>
      </div>
      <div class="support-note">Если нужной группы нет в списке, сверьте номер на <a href="https://eservice.omsu.ru/schedule/">eservice.omsu.ru</a>. Поиск идёт по началу названия.</div>
    </main>`;
}

function changesBody() {
  const own = state.groupId === 12246 ? CHANGES : [];
  const items = state.changeFilter === 'group' ? own : own.concat([
    { day: 'Вчера, 17 ноября', pair: 2, subject: 'Философия', kind: 'изменено', field: 'аудитория', from: '11-201', to: '11-204', other: 'МЕН-004-О-02' },
  ]);
  const byDay = items.reduce((acc, c) => {
    (acc[c.day] = acc[c.day] || []).push(c);
    return acc;
  }, {});
  return `
      <div class="filters" role="group" aria-label="Какие изменения показывать">
        <button class="filter" type="button" data-filter="group" aria-pressed="${state.changeFilter === 'group'}">Моя группа</button>
        <button class="filter" type="button" data-filter="all" aria-pressed="${state.changeFilter === 'all'}">Все группы</button>
      </div>
      ${items.length ? Object.entries(byDay).map(([day, list]) => `
        <section class="change-day" aria-label="${esc(day)}">
          <div class="change-day-head">${esc(day)}</div>
          ${list.map((c) => `
            <article class="change-item">
              <div class="change-pair">${c.pair}</div>
              <div>
                <h2 class="change-subject">${esc(c.subject)}</h2>
                <span class="change-kind">${esc(c.kind)}${c.field ? ` · ${esc(c.field)}` : ''}${c.subgroup ? ` · ${esc(c.subgroup)} подгруппа` : ''}${c.other ? ` · ${esc(c.other)}` : ''}</span>
                ${c.from ? `<p class="diff" aria-label="Было ${esc(c.from)}, стало ${esc(c.to)}"><del>${esc(c.from)}</del><span class="diff-arrow">→</span><ins>${esc(c.to)}</ins></p>` : `<p class="diff">${esc(c.text)}</p>`}
                ${c.iso && c.kind !== 'удалено' && (!state.subgroup || !c.subgroup || c.subgroup === state.subgroup) ? `<button class="link-btn change-open" type="button" data-day-iso="${c.iso}" data-slot="${c.pair}">Открыть пару</button>` : ''}
              </div>
            </article>`).join('')}
        </section>`).join('') : '<p class="empty-search" role="status">Изменений нет. Когда расписание поменяется, здесь появится запись.</p>'}`;
}

function renderChanges() {
  return `
    <main id="content">
      <div class="page-head">
        <h1 class="page-title">Изменения</h1>
        <p class="page-sub">${esc(currentGroup().name)} · последние 7 дней</p>
      </div>
      ${changesBody()}
      <p class="footnote">Изменения копятся с момента последней синхронизации. <a href="#/settings">Подписаться на уведомления</a></p>
    </main>`;
}

function renderSettings() {
  const n = state.notify;
  return `
    <main id="content">
      <div class="page-head">
        <h1 class="page-title">Настройки</h1>
        <p class="page-sub">Тема, подгруппа и уведомления для ${esc(currentGroup().name)}</p>
      </div>
      <section class="settings-group" aria-label="Настройки">
        ${themeBlock()}
        <h2 class="settings-heading">Расписание</h2>
        <div class="setting-row">
          <div><span class="setting-label">Моя подгруппа</span><p class="setting-desc">Влияет на расписание и уведомления. Если не знаете — оставьте «Все».</p></div>
          <div class="inline-field">
            <label class="sr-only" for="m-subgroup">Моя подгруппа</label>
            <select id="m-subgroup" name="subgroup">
              <option value="" ${!state.subgroup ? 'selected' : ''}>Все</option>
              ${subgroupNumbers().map((num) => `<option value="${num}" ${state.subgroup === num ? 'selected' : ''}>${num}</option>`).join('')}
            </select>
          </div>
        </div>
        <h2 class="settings-heading">Уведомления</h2>
        <div class="setting-row">
          <div><span class="setting-label">Изменения в расписании</span><p class="setting-desc">Пришлём, когда пара появится, переедет или отменится.</p></div>
          <label class="switch">
            <input type="checkbox" name="changes" aria-label="Изменения в расписании" ${n.changes ? 'checked' : ''}>
            <span class="track"></span><span class="thumb"></span>
            <span class="sr-only">Изменения в расписании</span>
          </label>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Дайджест на следующий день</span><p class="setting-desc">Одно сообщение вечером со всеми парами на завтра.</p></div>
          <label class="switch">
            <input type="checkbox" name="digest" aria-label="Дайджест на следующий день" ${n.digest ? 'checked' : ''}>
            <span class="track"></span><span class="thumb"></span>
            <span class="sr-only">Дайджест на следующий день</span>
          </label>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Время дайджеста</span></div>
          <div class="inline-field">
            <label class="sr-only" for="m-digest-time">Время дайджеста</label>
            <input id="m-digest-time" name="digest-time" type="text" inputmode="numeric" autocomplete="off" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" value="${n.digestTime}" ${n.digest ? '' : 'disabled'}>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Напоминание перед парой</span><p class="setting-desc">За сколько минут до начала прислать напоминание.</p></div>
          <label class="switch">
            <input type="checkbox" name="reminder" aria-label="Напоминание перед парой" ${n.reminder ? 'checked' : ''}>
            <span class="track"></span><span class="thumb"></span>
            <span class="sr-only">Напоминание перед парой</span>
          </label>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">За сколько минут</span></div>
          <div class="inline-field">
            <label class="sr-only" for="m-minutes">За сколько минут до пары</label>
            <select id="m-minutes" name="minutes" ${n.reminder ? '' : 'disabled'}>
              <option value="15" ${n.minutes === '15' ? 'selected' : ''}>15</option>
              <option value="30" ${n.minutes === '30' ? 'selected' : ''}>30</option>
              <option value="60" ${n.minutes === '60' ? 'selected' : ''}>60</option>
            </select>
            <span class="unit">минут</span>
          </div>
        </div>
        <div class="setting-row">
          <div><span class="setting-label">Часовой пояс</span></div>
          <div class="inline-field">
            <label class="sr-only" for="m-timezone">Часовой пояс</label>
            <select id="m-timezone" name="timezone">
              <option value="Asia/Omsk" selected>Омск, UTC+6</option>
              <option value="Asia/Novosibirsk">Новосибирск, UTC+7</option>
              <option value="Europe/Moscow">Москва, UTC+3</option>
            </select>
          </div>
        </div>
      </section>
      <p class="setting-sub">Уведомления приходят в этот браузер. Разрешение можно отозвать в настройках сайта. Всего можно подписаться на 10 групп, преподавателей и аудиторий.</p>
      <div class="save-row">
        <p class="autosave" role="status" data-save-status>Изменения сохраняются автоматически</p>
        <button class="btn-quiet" type="button" data-unsub>Отписаться от группы</button>
      </div>
      <div class="status-line"><i class="dot"></i>Сервер отвечает, кэш обновлён 2 минуты назад</div>
    </main>`;
}

function entityBody(kind) {
  const data = kind === 'tutor' ? TUTOR : AUDITORY;
  return `
      <div class="entity-head">
        <a class="back-link" href="#/today">${ICONS.arrowLeft}К расписанию группы</a>
        <h1 class="entity-title">${esc(data.title)}</h1>
        <p class="entity-meta">${esc(data.meta)}</p>
      </div>
      <div class="section-head">
        <h2 class="section-title">Эта неделя</h2>
        <span class="section-note">16–21 ноября</span>
      </div>
      ${['пн', 'вт', 'ср', 'чт', 'пт', 'сб'].map((d) => {
        const list = data.lessons.filter((l) => l.day === d);
        if (!list.length) return '';
        return `
          <section class="wday" aria-label="${d}">
            <div class="wday-head"><span class="wday-num">${list[0].num}</span><span class="wday-name">${d}</span><span class="wday-date"></span></div>
            ${list.map((l) => `
              <div class="wrow">
                <span class="wrow-time">${l.start}</span>
                <span class="wrow-subject">${esc(l.subject)}</span>
                <span class="wrow-room">${esc(kind === 'tutor' ? l.room : l.group)}</span>
                <span class="wrow-sub">${esc(l.kind)} · ${esc(kind === 'tutor' ? l.group : l.teacher)} · ${l.pair} пара</span>
              </div>`).join('')}
          </section>`;
      }).join('')}
      <p class="footnote">Расписание может меняться. <a href="#/changes">Смотреть изменения</a></p>`;
}

function renderEntity(kind) {
  return `<main id="content">${entityBody(kind)}</main>`;
}

function bottomNav(route) {
  const item = (href, label, icon, active) => `
    <a class="bn-item" href="${href}" ${active ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  return `
    <nav class="bottom-nav" aria-label="Основное меню">
      ${item('#/today', 'Сегодня', ICONS.today, route === 'today' || route === '')}
      ${item('#/week', 'Неделя', ICONS.week, route === 'week' || route === 'tutor' || route === 'auditory')}
      ${item('#/changes', 'Изменения', ICONS.changes, route === 'changes')}
      ${item('#/settings', 'Настройки', ICONS.settings, route === 'settings')}
    </nav>`;
}

function renderMobile() {
  const route = routeOf();
  if (route === 'search') {
    document.getElementById('mobile-app').innerHTML = `${state.online ? '' : offlineBar()}${renderSearchPage()}`;
    bindMobile();
    return;
  }
  let content = '';
  if (route === 'today' || route === '') content = renderToday();
  else if (route === 'week') content = renderWeekMobile();
  else if (route === 'changes') content = renderChanges();
  else if (route === 'settings') content = renderSettings();
  else if (route === 'tutor') content = renderEntity('tutor');
  else if (route === 'auditory') content = renderEntity('auditory');
  else content = renderToday();

  const showGroup = route !== 'tutor' && route !== 'auditory';
  document.getElementById('mobile-app').innerHTML = `${mTop(showGroup)}${state.online ? '' : offlineBar()}${content}${bottomNav(route)}`;
  bindMobile();
}

function bindMobile() {
  const app = document.getElementById('mobile-app');

  app.querySelectorAll('[data-day]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedDay = Number(btn.dataset.day);
      renderMobile();
    });
  });

  app.querySelectorAll('[data-week]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = state.weekOffset + Number(btn.dataset.week);
      state.weekOffset = Math.max(0, Math.min(1, next));
      renderMobile();
    });
  });

  const q = app.querySelector('#m-q');
  if (q) {
    q.addEventListener('input', () => {
      state.query = q.value;
      const results = app.querySelector('#m-search-results');
      if (results) results.innerHTML = renderResults();
      const recent = app.querySelector('#search-recent');
      if (recent) recent.hidden = state.query.trim().length >= 2;
      const clear = app.querySelector('[data-clear]');
      if (clear) clear.hidden = q.value.length === 0;
    });
  }
  const clear = app.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', () => {
    state.query = '';
    const input = app.querySelector('#m-q');
    if (input) { input.value = ''; input.focus(); }
    const results = app.querySelector('#m-search-results');
    if (results) results.innerHTML = '';
    const recent = app.querySelector('#search-recent');
    if (recent) recent.hidden = false;
    clear.hidden = true;
  });

  app.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.changeFilter = btn.dataset.filter;
      renderMobile();
    });
  });

  const changesToggle = app.querySelector('input[name="changes"]');
  const digestToggle = app.querySelector('input[name="digest"]');
  const reminderToggle = app.querySelector('input[name="reminder"]');
  if (changesToggle) changesToggle.addEventListener('change', () => { state.notify.changes = changesToggle.checked; markSaved(app); });
  if (digestToggle) digestToggle.addEventListener('change', () => {
    state.notify.digest = digestToggle.checked;
    markSaved(app);
    const t = app.querySelector('#m-digest-time');
    if (t) t.disabled = !digestToggle.checked;
  });
  if (reminderToggle) reminderToggle.addEventListener('change', () => {
    state.notify.reminder = reminderToggle.checked;
    markSaved(app);
    const m = app.querySelector('#m-minutes');
    if (m) m.disabled = !reminderToggle.checked;
  });
  const digestTime = app.querySelector('#m-digest-time');
  if (digestTime) digestTime.addEventListener('change', () => { state.notify.digestTime = digestTime.value; markSaved(app); });
  const minutes = app.querySelector('#m-minutes');
  if (minutes) minutes.addEventListener('change', () => { state.notify.minutes = minutes.value; markSaved(app); });
  const subgroup = app.querySelector('#m-subgroup');
  if (subgroup) subgroup.addEventListener('change', () => {
    applySubgroup(subgroup.value);
    markSaved(app);
  });
  const timezone = app.querySelector('#m-timezone');
  if (timezone) timezone.addEventListener('change', () => { state.notify.timezone = timezone.value; markSaved(app); });

  const unsub = app.querySelector('[data-unsub]');
  if (unsub) unsub.addEventListener('click', () => {
    if (unsub.dataset.confirm !== '1') {
      unsub.dataset.confirm = '1';
      unsub.textContent = 'Нажмите ещё раз, чтобы отписаться';
      return;
    }
    unsub.textContent = 'Вы отписаны от группы';
    unsub.disabled = true;
  });
}

/* ------------------------------- desktop ------------------------------- */

function deskSide(route) {
  const navItem = (href, label, icon, active) => `<a href="${href}" ${active ? 'aria-current="page"' : ''}>${icon}${label}</a>`;
  return `
    <aside class="side" aria-label="Навигация">
      <a class="brand" href="#/week" aria-label="сетка — на главную">сетка<span class="brand-dot"></span></a>
      <a class="side-search" href="#/search" aria-label="Открыть поиск">
        ${ICONS.search}<span>Найти группу или преподавателя</span>
      </a>
      <nav class="side-nav" aria-label="Разделы">
        ${navItem('#/week', 'Неделя', ICONS.week, route === 'week' || route === '')}
        ${navItem('#/changes', 'Изменения', ICONS.changes, route === 'changes')}
        ${navItem('#/settings', 'Настройки', ICONS.settings, route === 'settings')}
      </nav>
      <div>
        <p class="side-label">Мои группы</p>
        <div class="side-groups">
          ${GROUPS.map((group) => `
            <a class="side-group" href="#/week" data-group="${group.id}" data-group-target="#/week" ${group.id === state.groupId ? 'aria-current="true"' : ''}>
              <span>${esc(group.name)}</span><i class="pin"></i>
            </a>`).join('')}
        </div>
      </div>
      <div class="side-foot">
        Расписание ОмГУ, зеркало на этом сервере.<br>
        <span class="freshness"><i class="dot"></i>обновлено 2 мин назад</span>
      </div>
    </aside>`;
}

function deskTop(route) {
  const week = weekData();
  const weekCount = week.reduce((n, d) => n + slotsOf(d).filter((slot) => slot.entries.length).length, 0);
  if (route === 'search') {
    return `<header class="desk-top"><div class="desk-title"><h1 class="desk-group">Поиск</h1><div class="desk-sub">группы, преподаватели, аудитории</div></div></header>`;
  }
  if (route === 'changes') {
    return `<header class="desk-top"><div class="desk-title"><h1 class="desk-group">Изменения</h1><div class="desk-sub">${esc(currentGroup().name)} · последние 7 дней</div></div></header>`;
  }
  if (route === 'settings') {
    return `<header class="desk-top"><div class="desk-title"><h1 class="desk-group">Настройки</h1><div class="desk-sub">${esc(currentGroup().name)}</div></div></header>`;
  }
  if (route === 'tutor' || route === 'auditory') {
    const data = route === 'tutor' ? TUTOR : AUDITORY;
    return `<header class="desk-top"><div class="desk-title"><h1 class="desk-group">${esc(data.title)}</h1><div class="desk-sub">${route === 'tutor' ? 'преподаватель' : 'аудитория'} · эта неделя</div></div></header>`;
  }
  return `
    <header class="desk-top">
      <div class="desk-title">
        <h1 class="desk-group">${esc(currentGroup().name)}</h1>
        <div class="desk-sub"><span data-subgroup-text="prefix">${state.subgroup ? `подгруппа ${state.subgroup} · ` : ''}</span>${weekCount} ${plural(weekCount, 'пара', 'пары', 'пар')} на неделе</div>
      </div>
      <div class="desk-tools">
        <div class="week-switch">
          <button class="arrow-btn" type="button" aria-label="Предыдущая неделя" data-week="-1" ${state.weekOffset === 0 ? 'disabled style="opacity:.4"' : ''}>${ICONS.chevronLeft}</button>
          <span class="label">${week[0].num}–${week[5].num} ноября</span>
          <button class="arrow-btn" type="button" aria-label="Следующая неделя" data-week="1">${ICONS.chevronRight}</button>
        </div>
        <span class="desk-updated"><i class="dot"></i>обновлено 2 мин назад</span>
      </div>
    </header>`;
}

function wkCell(day, pair) {
  const slot = slotOf(day, pair);
  const cellClass = day.iso === TODAY_ISO ? 'is-today' : '';
  if (!slot.entries.length && !slot.window) return `<div class="wk-cell ${cellClass}"></div>`;
  if (slot.window) return `<div class="wk-cell ${cellClass}"><span class="wk-window">окно</span></div>`;

  const change = slotHasChange(slot);
  if (slot.entries.length > 1) {
    const names = slot.entries.map((e) => e.subject).join(' · ');
    const rooms = Array.from(new Set(slot.entries.map((e) => e.room))).join(', ');
    return `
      <div class="wk-cell ${cellClass}">
        <button class="wk-item is-multi ${change ? 'is-change' : ''}" type="button" data-day-iso="${day.iso}" data-slot="${slot.pair}" aria-haspopup="dialog"
                aria-label="${slot.pair} пара, ${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}, открыть детали">
          <span class="s">${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}${change ? ' <span class="m-change">замена</span>' : ''}</span>
          <span class="m">${esc(names)}</span>
          <span class="m">${esc(rooms)}</span>
        </button>
      </div>`;
  }

  const l = slot.entries[0];
  return `
    <div class="wk-cell ${cellClass}">
      <button class="wk-item ${l.change ? 'is-change' : ''}" type="button" data-day-iso="${day.iso}" data-slot="${slot.pair}" aria-haspopup="dialog"
              aria-label="${slot.pair} пара, ${esc(l.subject)}, открыть детали">
        <span class="s">${esc(l.subject)}</span>
        <span class="m">${esc(l.room)} · ${esc(l.kind)}</span>
        ${l.change ? '<span class="f">замена</span>' : ''}
      </button>
    </div>`;
}

function renderWeekGrid() {
  const week = weekData();
  const cells = [];
  cells.push('<div class="wk-corner" aria-hidden="true"></div>');
  week.forEach((d) => {
    cells.push(`<div class="wk-head ${d.iso === TODAY_ISO ? 'is-today' : ''}"><span class="dn">${d.short}</span><span class="dd">${d.num}</span></div>`);
  });
  for (let pair = 1; pair <= 8; pair += 1) {
    const sample = week.flatMap((d) => d.lessons).find((l) => l.pair === pair);
    cells.push(`<div class="wk-time"><span class="n">${pair}</span><span class="s">${sample ? sample.start : ['08:45','10:30','12:45','14:30','16:15','18:00','19:45','21:30'][pair - 1]}</span></div>`);
    week.forEach((d) => cells.push(wkCell(d, pair)));
  }
  return `
    <div class="week-wrap">
      <div class="week-grid" aria-label="Расписание на неделю">
        ${cells.join('')}
      </div>
    </div>`;
}

function renderAside() {
  const week = weekData();
  const day = week[2];
  const slots = slotsOf(day).filter((s) => s.entries.length);
  const total = slots.length;
  return `
    <aside class="aside" aria-label="Детали дня">
      <div>
        <h2 class="aside-title">${esc(dayLabel(day))}</h2>
        <p class="aside-sub">${total} ${plural(total, 'пара', 'пары', 'пар')}${slots.length ? ` · ${slots[0].start}–${slots[slots.length - 1].end}` : ''}</p>
        <div class="aside-block">
          <ul class="aside-list">
            ${slots.map((slot) => {
              const isNow = slot.pair === NOW.pair && state.weekOffset === 0;
              const multi = slot.entries.length > 1;
              const title = multi ? `${slot.entries.length} ${plural(slot.entries.length, 'занятие', 'занятия', 'занятий')}` : slot.entries[0].subject;
              const rooms = Array.from(new Set(slot.entries.map((e) => e.room))).join(', ');
              return `
                <li>
                  <button class="aside-item ${isNow ? 'is-now' : ''}" type="button" data-day-iso="${day.iso}" data-slot="${slot.pair}" aria-haspopup="dialog"
                          aria-label="${slot.pair} пара, открыть детали">
                    <span class="p">${slot.pair}</span>
                    <span class="aside-body">
                      <span class="s">${esc(title)}</span>
                      <span class="m">${slot.start}–${slot.end} · ${esc(rooms)}${slotHasChange(slot) ? ' · замена' : ''}</span>
                    </span>
                  </button>
                </li>`;
            }).join('') || '<li class="aside-item"><div></div><div class="m">Занятий нет</div></li>'}
          </ul>
        </div>
      </div>
      <div>
        <h2 class="aside-title" style="font-size:14px">Изменения</h2>
        <div class="aside-block">
          ${state.groupId === 12246 && state.weekOffset === 0 ? `
            ${!state.subgroup || state.subgroup === '1' ? `<a class="aside-change" href="#/changes">
              <div class="ac-subject">Базы данных · 4 пара · 1 подгруппа</div>
              <div class="ac-text">аудитория <del>4-312</del> → <ins>4-308</ins></div>
            </a>` : ''}
            <a class="aside-change" href="#/changes">
              <div class="ac-subject">Математический анализ · 2 пара</div>
              <div class="ac-text">преподаватель <del>Сидоров А. В.</del> → <ins>Иванов И. И.</ins></div>
            </a>
            <a class="aside-link" href="#/changes">Все изменения ${ICONS.chevronRight}</a>` : '<p class="aside-sub">Изменений нет.</p>'}
        </div>
      </div>
      <div>
        <h2 class="aside-title" style="font-size:14px">Уведомления</h2>
        <p class="aside-sub" style="margin-top:4px">Подписка на изменения этой группы включена. Дайджест приходит в 19:00.</p>
        <a class="aside-link" href="#/settings">Настроить ${ICONS.chevronRight}</a>
      </div>
    </aside>`;
}

function renderChangesPage() {
  return `
    <div class="desk-page">
      ${changesBody()}
    </div>`;
}

function renderSettingsPage() {
  const n = state.notify;
  return `
    <div class="desk-page">
      <section class="settings-group">
        ${themeBlock()}
        <h2 class="settings-heading">Расписание</h2>
        <div class="setting-row">
          <div><span class="setting-label">Моя подгруппа</span><p class="setting-desc">Влияет на расписание и уведомления. Если не знаете — оставьте «Все».</p></div>
          <div class="inline-field">
            <label class="sr-only" for="d-subgroup">Моя подгруппа</label>
            <select id="d-subgroup" name="subgroup">
              <option value="" ${!state.subgroup ? 'selected' : ''}>Все</option>
              ${subgroupNumbers().map((num) => `<option value="${num}" ${state.subgroup === num ? 'selected' : ''}>${num}</option>`).join('')}
            </select>
          </div>
        </div>
        <h2 class="settings-heading">Уведомления</h2>
        <div class="setting-row"><div><span class="setting-label">Изменения в расписании</span><p class="setting-desc">Пришлём, когда пара появится, переедет или отменится.</p></div>
          <label class="switch"><input type="checkbox" name="changes" aria-label="Изменения в расписании" ${n.changes ? 'checked' : ''}><span class="track"></span><span class="thumb"></span><span class="sr-only">Изменения в расписании</span></label></div>
        <div class="setting-row"><div><span class="setting-label">Дайджест на следующий день</span><p class="setting-desc">Одно сообщение вечером со всеми парами на завтра.</p></div>
          <label class="switch"><input type="checkbox" name="digest" aria-label="Дайджест на следующий день" ${n.digest ? 'checked' : ''}><span class="track"></span><span class="thumb"></span><span class="sr-only">Дайджест на следующий день</span></label></div>
        <div class="setting-row"><div><span class="setting-label">Время дайджеста</span></div>
          <div class="inline-field"><label class="sr-only" for="d-digest-time">Время дайджеста</label><input id="d-digest-time" name="digest-time" type="text" inputmode="numeric" autocomplete="off" pattern="[0-2][0-9]:[0-5][0-9]" maxlength="5" value="${n.digestTime}" ${n.digest ? '' : 'disabled'}></div></div>
        <div class="setting-row"><div><span class="setting-label">Напоминание перед парой</span><p class="setting-desc">За сколько минут до начала прислать напоминание.</p></div>
          <label class="switch"><input type="checkbox" name="reminder" aria-label="Напоминание перед парой" ${n.reminder ? 'checked' : ''}><span class="track"></span><span class="thumb"></span><span class="sr-only">Напоминание перед парой</span></label></div>
        <div class="setting-row"><div><span class="setting-label">За сколько минут</span></div>
          <div class="inline-field"><label class="sr-only" for="d-minutes">За сколько минут до пары</label><select id="d-minutes" name="minutes" ${n.reminder ? '' : 'disabled'}><option value="15" ${n.minutes === '15' ? 'selected' : ''}>15</option><option value="30" ${n.minutes === '30' ? 'selected' : ''}>30</option><option value="60" ${n.minutes === '60' ? 'selected' : ''}>60</option></select><span class="unit">минут</span></div></div>
        <div class="setting-row"><div><span class="setting-label">Часовой пояс</span></div>
          <div class="inline-field"><label class="sr-only" for="d-timezone">Часовой пояс</label><select id="d-timezone" name="timezone"><option value="Asia/Omsk" selected>Омск, UTC+6</option><option value="Asia/Novosibirsk">Новосибирск, UTC+7</option><option value="Europe/Moscow">Москва, UTC+3</option></select></div></div>
      </section>
      <div class="save-row"><p class="autosave" role="status" data-save-status>Изменения сохраняются автоматически</p><button class="btn-quiet" type="button" data-unsub>Отписаться от группы</button></div>
      <div class="status-line"><i class="dot"></i>Сервер отвечает, кэш обновлён 2 минуты назад</div>
    </div>`;
}

function renderSearchDesk() {
  return `
    <div class="desk-page">
      <div class="search-field" style="border-bottom:2px solid var(--ink)">
        ${ICONS.search}
        <label class="sr-only" for="d-q">Поиск по группам, преподавателям и аудиториям</label>
        <input id="d-q" name="q" type="search" autocomplete="off" spellcheck="false" placeholder="Группа, преподаватель, аудитория" value="${esc(state.query)}">
      </div>
      <p class="search-hint">Начните вводить название: например, «ЮСС» или «Иван».</p>
      <div id="d-search-results">${state.query.trim().length >= 2 ? renderResults() : ''}</div>
    </div>`;
}

function renderDesktop() {
  const route = routeOf() || 'week';
  let body = '';
  let aside = '';
  if (route === 'week' || route === 'today') {
    body = `<div class="desk-body">${renderWeekGrid()}${renderAside()}</div>`;
  } else if (route === 'changes') {
    body = `<div class="desk-body is-single">${renderChangesPage()}</div>`;
  } else if (route === 'settings') {
    body = `<div class="desk-body is-single">${renderSettingsPage()}</div>`;
  } else if (route === 'search') {
    body = `<div class="desk-body is-single">${renderSearchDesk()}</div>`;
  } else if (route === 'tutor' || route === 'auditory') {
    body = `<div class="desk-body is-single"><div class="desk-page">${entityBody(route)}</div></div>`;
  } else {
    body = `<div class="desk-body">${renderWeekGrid()}${renderAside()}</div>`;
  }
  const root = document.getElementById('desktop-app');
  root.innerHTML = `${deskSide(route)}<div class="desk-main" id="d-content">${deskTop(route)}${state.online ? '' : offlineBar()}${body}</div>`;
  bindDesktop();
  return { route, aside };
}

function bindDesktop() {
  const app = document.getElementById('desktop-app');
  app.querySelectorAll('[data-week]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = state.weekOffset + Number(btn.dataset.week);
      state.weekOffset = Math.max(0, Math.min(1, next));
      render();
    });
  });
  app.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.changeFilter = btn.dataset.filter;
      render();
    });
  });
  const q = app.querySelector('#d-q');
  if (q) {
    q.addEventListener('input', () => {
      state.query = q.value;
      const results = app.querySelector('#d-search-results');
      if (results) results.innerHTML = renderResults();
      const clear = app.querySelector('[data-clear]');
      if (clear) clear.hidden = q.value.length === 0;
    });
  }
  const clear = app.querySelector('[data-clear]');
  if (clear) clear.addEventListener('click', () => {
    state.query = '';
    const input = app.querySelector('#d-q');
    if (input) { input.value = ''; input.focus(); }
    const results = app.querySelector('#d-search-results');
    if (results) results.innerHTML = '';
    clear.hidden = true;
  });

  const changes = app.querySelector('input[name="changes"]');
  if (changes) changes.addEventListener('change', () => { state.notify.changes = changes.checked; markSaved(app); });
  const digest = app.querySelector('input[name="digest"]');
  if (digest) digest.addEventListener('change', () => {
    state.notify.digest = digest.checked;
    markSaved(app);
    const t = app.querySelector('#d-digest-time');
    if (t) t.disabled = !digest.checked;
  });
  const reminder = app.querySelector('input[name="reminder"]');
  if (reminder) reminder.addEventListener('change', () => {
    state.notify.reminder = reminder.checked;
    markSaved(app);
    const m = app.querySelector('#d-minutes');
    if (m) m.disabled = !reminder.checked;
  });

  const digestTime = app.querySelector('#d-digest-time');
  if (digestTime) digestTime.addEventListener('change', () => { state.notify.digestTime = digestTime.value; markSaved(app); });
  const minutes = app.querySelector('#d-minutes');
  if (minutes) minutes.addEventListener('change', () => { state.notify.minutes = minutes.value; markSaved(app); });
  const subgroup = app.querySelector('#d-subgroup');
  if (subgroup) subgroup.addEventListener('change', () => {
    applySubgroup(subgroup.value);
    markSaved(app);
  });
  const timezone = app.querySelector('#d-timezone');
  if (timezone) timezone.addEventListener('change', () => { state.notify.timezone = timezone.value; markSaved(app); });

  const unsub = app.querySelector('[data-unsub]');
  if (unsub) unsub.addEventListener('click', () => {
    if (unsub.dataset.confirm !== '1') {
      unsub.dataset.confirm = '1';
      unsub.textContent = 'Нажмите ещё раз, чтобы отписаться';
      return;
    }
    unsub.textContent = 'Вы отписаны от группы';
    unsub.disabled = true;
  });
}

/* ------------------------------- boot ------------------------------- */

function render() {
  renderMobile();
  renderDesktop();
}

window.addEventListener('hashchange', () => {
  state.route = routeOf();
  state.query = '';
  render();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && routeOf() === 'search') {
    location.hash = '#/today';
  }
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-theme-opt]');
  if (btn) setTheme(btn.dataset.themeOpt);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.theme === 'system') applyTheme();
});

window.addEventListener('online', () => { state.online = true; render(); });
window.addEventListener('offline', () => { state.online = false; render(); });

const sheet = document.getElementById('slot-sheet');
if (sheet) {
  sheet.addEventListener('close', () => document.body.classList.remove('sheet-open'));
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet) sheet.close();
  });
}

document.addEventListener('click', (e) => {
  const all = e.target.closest('[data-subgroup-all]');
  if (all) {
    e.preventDefault();
    setSubgroup('');
    return;
  }
  const groupTrigger = e.target.closest('[data-group]');
  if (groupTrigger) {
    e.preventDefault();
    setGroup(groupTrigger.dataset.group);
    const target = groupTrigger.dataset.groupTarget;
    if (target && location.hash !== target) location.hash = target;
    return;
  }
  const trigger = e.target.closest('[data-slot]');
  if (!trigger || !trigger.dataset.dayIso) return;
  e.preventDefault();
  openSlot(trigger.dataset.dayIso, Number(trigger.dataset.slot));
});

applyTheme();
render();
