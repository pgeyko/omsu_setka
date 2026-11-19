import { useMemo, useState } from 'react';
import { AppLink } from '../components/AppLink';
import { useChangesInfinite, useGroupName } from '../api/queries';
import { usePageMeta } from '../lib/usePageMeta';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import type { FieldChange, Lesson, ScheduleChange } from '../api/types';
import { weekStartForDate } from '../lib/date';
import { buildingOf, cleanSubject, dayMonthLabel, normalizeSubgroup, roomOf } from '../lib/schedule';

function parseLesson(raw?: string): Lesson | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Lesson;
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function lessonForChange(change: ScheduleChange): Lesson | null {
  return parseLesson(change.new_data) || parseLesson(change.old_data);
}

function subjectForChange(change: ScheduleChange, lesson: Lesson | null): string {
  const raw = change.subject || lesson?.lesson || '';
  if (!raw) return 'Изменение';
  return cleanSubject({ ...(lesson || {}), lesson: raw } as Lesson);
}

function deriveDiff(change: ScheduleChange): FieldChange[] {
  if (change.changes?.length) return change.changes;
  if (change.change_type !== 'modified') return [];
  const before = parseLesson(change.old_data);
  const after = parseLesson(change.new_data);
  if (!before || !after) return [];
  const fields: Array<[keyof Lesson, string]> = [
    ['lesson', 'предмет'],
    ['teacher', 'преподаватель'],
    ['auditCorps', 'аудитория'],
    ['time', 'пара'],
    ['subgroupName', 'подгруппа'],
  ];
  return fields
    .filter(([field]) => String(before[field] ?? '') !== String(after[field] ?? ''))
    .map(([field, label]) => ({
      field,
      label,
      old: String(before[field] ?? ''),
      new: String(after[field] ?? ''),
    }));
}

function ChangeItem({
  change,
  groupId,
  scope,
}: {
  change: ScheduleChange;
  groupId: number;
  scope: 'group' | 'all';
}) {
  const lesson = lessonForChange(change);
  const pair = change.pair || lesson?.time;
  const targetGroup = scope === 'all' ? change.entity_id : groupId;
  const link = change.day && pair && (scope === 'group' || change.entity_type === 'group')
    ? `/g/${targetGroup}/week?week_start=${weekStartForDate(change.day)}&day=${change.day}&slot=${pair}`
    : null;
  const subgroup = change.subgroup || lesson?.subgroup_number || normalizeSubgroup(lesson?.subgroupName);
  const subject = subjectForChange(change, lesson);
  const teacher = lesson?.teacher || '';
  const room = lesson ? lesson.auditCorps || roomOf(lesson) : '';
  const building = lesson ? buildingOf(lesson) : '';
  const diff = deriveDiff(change);
  return (
    <article className="change-item">
      <div className="change-pair">
        {pair ? (
          <>
            <span>{pair}</span>
            <span className="change-pair-label">пара</span>
          </>
        ) : '—'}
      </div>
      <div>
        <h2 className="change-subject">{subject}</h2>
        <span className="change-kind">
          {change.change_type === 'added' ? 'добавлено' : change.change_type === 'removed' ? 'удалено' : 'изменено'}
          {subgroup ? ` · ${subgroup}-я подгруппа` : ''}
        </span>
        {!change.day ? (
          <p className="change-unknown-date">Дата занятия в старой записи не сохранилась</p>
        ) : null}
        {teacher || room ? (
          <p className="change-meta">
            {teacher}
            {teacher && room ? ' · ' : ''}
            {room ? (
              <>
                ауд. <b>{room}</b>
                {building ? ` · корпус ${building}` : ''}
              </>
            ) : null}
          </p>
        ) : null}
        {diff.length ? (
          diff.map((field) => (
            <p className="diff" key={`${change.id}-${field.field}`}>
              {field.label}: <del>{field.old || '—'}</del> <span className="diff-arrow">→</span>{' '}
              <ins>{field.new || '—'}</ins>
            </p>
          ))
        ) : (
          <p className="diff">
            {change.change_type === 'removed'
              ? 'пара отменена'
              : change.change_type === 'added'
                ? 'пара появилась в расписании'
                : 'пара изменилась'}
          </p>
        )}
        {link ? (
          <AppLink className="link-btn change-open" to={link}>
            Открыть пару
          </AppLink>
        ) : null}
      </div>
    </article>
  );
}

function ChangesBody({ groupId }: { groupId: number }) {
  const subgroup = usePreferences((state) => state.subgroup);
  const [scope, setScope] = useState<'group' | 'all'>('group');
  const changes = useChangesInfinite('group', groupId, subgroup, scope);
  const items = useMemo(() => changes.data?.pages.flatMap((page) => page.items) || [], [changes.data]);
  const grouped = useMemo(() => {
    const map = new Map<string, ScheduleChange[]>();
    items.forEach((change) => {
      const day = change.day || change.created_at.slice(0, 10);
      const list = map.get(day) || [];
      list.push(change);
      map.set(day, list);
    });
    return Array.from(map.entries());
  }, [items]);

  return (
    <>
      <div className="filters" role="group" aria-label="Какие изменения показывать">
        <button
          className="filter"
          type="button"
          aria-pressed={scope === 'group'}
          onClick={() => setScope('group')}
        >
          Моя группа
        </button>
        <button
          className="filter"
          type="button"
          aria-pressed={scope === 'all'}
          onClick={() => setScope('all')}
        >
          Все группы
        </button>
      </div>

      {changes.isLoading ? <div className="skeleton-list">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-row" key={index} />)}</div> : null}
      {changes.isError ? <p className="empty-search">Не удалось загрузить изменения.</p> : null}
      {!changes.isLoading && !items.length ? (
        <p className="empty-search" role="status">Изменений нет. Когда расписание поменяется, здесь появится запись.</p>
      ) : null}

      {grouped.map(([day, list]) => {
        const hasLessonDay = list.some((change) => change.day === day);
        const heading = hasLessonDay
          ? `Изменения на ${dayMonthLabel(day)}`
          : `Обнаружено ${dayMonthLabel(day)}`;
        return (
        <section className="change-day" key={day} aria-label={heading}>
          <div className="change-day-head">{heading}</div>
          {list.map((change) => (
            <ChangeItem key={change.id} change={change} groupId={groupId} scope={scope} />
          ))}
        </section>
        );
      })}

      {changes.hasNextPage ? (
        <div className="more-row">
          <button className="more-btn" type="button" onClick={() => changes.fetchNextPage()} disabled={changes.isFetchingNextPage}>
            {changes.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
          </button>
        </div>
      ) : null}
    </>
  );
}

export function ChangesPage({ groupId }: { groupId: number }) {
  const isDesktop = useIsDesktop();
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  usePageMeta(`Изменения — ${groupName} — сетка`, `Последние изменения расписания группы ${groupName}.`);

  if (isDesktop) {
    return (
      <>
        <header className="desk-top">
          <div className="desk-title">
            <h1 className="desk-group">Изменения</h1>
            <div className="desk-sub">{groupName} · последние 7 дней</div>
          </div>
        </header>
        <div className="desk-body is-single">
          <div className="desk-page">
            <ChangesBody groupId={groupId} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Изменения</h1>
        <p className="page-sub">{groupName} · последние 7 дней</p>
      </div>
      <ChangesBody groupId={groupId} />
      <p className="footnote">Изменения копятся с момента последней синхронизации. <AppLink to={`/g/${groupId}/settings`}>Подписаться на уведомления</AppLink></p>
    </>
  );
}
