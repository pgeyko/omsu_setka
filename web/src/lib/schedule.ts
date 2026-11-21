import type { Day, Lesson } from '../api/types';

export const TIME_SLOTS: Record<number, { start: string; end: string }> = {
  1: { start: '08:45', end: '10:20' },
  2: { start: '10:30', end: '12:05' },
  3: { start: '12:45', end: '14:20' },
  4: { start: '14:30', end: '16:05' },
  5: { start: '16:15', end: '17:50' },
  6: { start: '18:00', end: '19:35' },
  7: { start: '19:45', end: '21:20' },
  8: { start: '21:30', end: '23:05' },
};

const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export interface SlotVariant {
  teacher: string;
  room: string;
  building: string;
}

export interface SlotEntry {
  id: number;
  lesson: Lesson;
  subject: string;
  kind: string;
  teacher: string;
  room: string;
  building: string;
  subgroups: string[];
  changed: boolean;
  /** Parallel options (electives, language groups) merged into one entry. */
  variants: SlotVariant[];
}

export interface Slot {
  pair: number;
  start: string;
  end: string;
  entries: SlotEntry[];
  window: boolean;
}

export function slotMinutes(slot: Slot): { start: number; end: number } {
  const parse = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  return { start: parse(slot.start), end: parse(slot.end) };
}

export function normalizeSubgroup(value: string | undefined | null): string {
  if (!value) return '';
  const suffix = value.match(/\/(\d+)\s*$/);
  if (suffix) return suffix[1];
  const after = value.match(/подгруппа\s*(\d+)/i);
  if (after) return after[1];
  const before = value.match(/(\d+)\s*(?:подгруппа|подгр|п\/г)/i);
  if (before) return before[1];
  const only = value.match(/^\s*(\d+)\s*$/);
  return only ? only[1] : '';
}

export function typeLabel(typeWork: string | undefined): string {
  const value = (typeWork || '').toLowerCase();
  if (value.includes('лек')) return 'лекция';
  if (value.includes('прак')) return 'практика';
  if (value.includes('лаб')) return 'лабораторная';
  if (value.includes('сем')) return 'семинар';
  if (value.includes('конс')) return 'консультация';
  return typeWork || 'занятие';
}

export function cleanSubject(lesson: Lesson): string {
  const suffixes = [' лек', ' прак', ' лаб', ' сем', ' конс'];
  let value = lesson.lesson.trim();
  const lower = value.toLowerCase();
  for (const suffix of suffixes) {
    if (lower.endsWith(suffix)) {
      value = value.slice(0, -suffix.length).trim();
      break;
    }
  }
  return value;
}

export function buildingOf(lesson: Lesson): string {
  const match = lesson.auditCorps.match(/^\(?(\d+)-/);
  const derived = match && match[1] !== '0' ? match[1] : '';
  if (lesson.building && lesson.building !== '0') return lesson.building;
  return derived;
}

export function roomOf(lesson: Lesson): string {
  if (lesson.room) return lesson.room;
  const match = lesson.auditCorps.match(/^\(?\d+-([^\s)]+)/);
  return match ? match[1].replace(/\*$/, '') : lesson.auditCorps;
}

export function lessonSubgroup(lesson: Lesson): string {
  return lesson.subgroup_number || normalizeSubgroup(lesson.subgroupName);
}

export function lessonDate(day: Day): string {
  if (day.date) return day.date;
  const match = day.day.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : day.day;
}

export function dayLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return `${weekdayTitle(iso)}, ${dayMonthLabel(iso)}`;
}

export function weekdayTitle(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const name = WEEKDAYS[date.getDay()];
  return `${name[0].toUpperCase()}${name.slice(1)}`;
}

export function dayMonthLabel(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function weekdayFull(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  return WEEKDAYS[date.getDay()];
}

export function shortDay(iso: string): { weekday: string; day: string; today: boolean } {
  const date = new Date(`${iso}T00:00:00`);
  return {
    weekday: WEEKDAYS_SHORT[date.getDay()],
    day: String(date.getDate()).padStart(2, '0'),
    today: iso === todayISO(),
  };
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function startOfWeek(date = new Date()): Date {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function weekDays(weekStart: string): string[] {
  const start = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return isoDate(date);
  });
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function matchesSubgroup(lesson: Lesson, subgroup: string): boolean {
  if (!subgroup) return true;
  const value = lessonSubgroup(lesson);
  return !value || value === subgroup;
}

export function slotsOf(day: Day, subgroup: string, changedIds: Set<number>): Slot[] {
  const byPair = new Map<number, Lesson[]>();
  day.lessons
    .filter((lesson) => matchesSubgroup(lesson, subgroup))
    .forEach((lesson) => {
      const list = byPair.get(lesson.time) || [];
      list.push(lesson);
      byPair.set(lesson.time, list);
    });

  const occupied = Array.from(byPair.keys()).sort((a, b) => a - b);
  if (!occupied.length) return [];
  const minPair = occupied[0];
  const maxPair = Math.min(8, occupied[occupied.length - 1]);

  const result: Slot[] = [];
  for (let pair = minPair; pair <= maxPair; pair += 1) {
    const lessons = byPair.get(pair) || [];
    const times = TIME_SLOTS[pair] || { start: '??:??', end: '??:??' };
    if (!lessons.length) {
      result.push({ pair, ...times, entries: [], window: true });
      continue;
    }
    const merged = new Map<string, SlotEntry>();
    lessons.forEach((lesson) => {
      const subject = cleanSubject(lesson);
      const kind = typeLabel(lesson.type_work);
      const subgroupNumber = lessonSubgroup(lesson);
      // Entries without a subgroup are parallel options (electives, language
      // groups): merge them by subject. Split-by-subgroup lessons stay apart.
      const key = subgroupNumber
        ? [subject, kind, lesson.teacher, lesson.auditCorps, lesson.group].join('|')
        : [subject, kind, lesson.group].join('|');
      const variant: SlotVariant = {
        teacher: lesson.teacher,
        room: lesson.auditCorps || roomOf(lesson),
        building: buildingOf(lesson),
      };
      const existing = merged.get(key);
      if (existing) {
        if (subgroupNumber && !existing.subgroups.includes(subgroupNumber)) existing.subgroups.push(subgroupNumber);
        if (!existing.variants.some((item) => item.teacher === variant.teacher && item.room === variant.room)) {
          existing.variants.push(variant);
        }
        if (changedIds.has(lesson.id)) existing.changed = true;
        return;
      }
      merged.set(key, {
        id: lesson.id,
        lesson,
        subject,
        kind,
        teacher: lesson.teacher,
        room: variant.room,
        building: variant.building,
        subgroups: subgroupNumber ? [subgroupNumber] : [],
        changed: changedIds.has(lesson.id),
        variants: [variant],
      });
    });
    result.push({ pair, ...times, entries: Array.from(merged.values()), window: false });
  }
  return result;
}

export function lessonCountLabel(count: number): string {
  return `${count} ${plural(count, 'занятие', 'занятия', 'занятий')}`;
}

export function variantCountLabel(count: number): string {
  return `${count} ${plural(count, 'вариант', 'варианта', 'вариантов')}`;
}

export function slotLabel(slot: Slot): string {
  return `${slot.pair} пара · ${slot.start}–${slot.end}`;
}

export function subgroupLabel(entry: SlotEntry): string {
  if (!entry.subgroups.length) return '';
  const ordinal = (value: string) => `${value}-я`;
  if (entry.subgroups.length === 1) return `${ordinal(entry.subgroups[0])} подгруппа`;
  return `${entry.subgroups.map(ordinal).join(', ')} подгруппы`;
}

export function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
