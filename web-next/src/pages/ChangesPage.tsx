import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useChangesInfinite, useGroupName } from '../api/queries';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import type { ScheduleChange } from '../api/types';
import { dayHeading, relativeDate, weekStartForDate } from '../lib/date';

function ChangeItem({ change, groupId }: { change: ScheduleChange; groupId: number }) {
  const day = change.day || change.created_at.slice(0, 10);
  const link = change.day && change.pair
    ? `/g/${groupId}/week?week_start=${weekStartForDate(change.day)}&day=${change.day}&slot=${change.pair}`
    : null;
  return (
    <article className="change-item">
      <div className="change-pair">{change.pair || '—'}</div>
      <div>
        <h2 className="change-subject">{change.subject || 'Изменение'}</h2>
        <span className="change-kind">
          {change.change_type === 'added' ? 'добавлено' : change.change_type === 'removed' ? 'удалено' : 'изменено'}
          {change.subgroup ? ` · ${change.subgroup} подгруппа` : ''}
        </span>
        {change.changes?.length ? (
          change.changes.map((field) => (
            <p className="diff" key={`${change.id}-${field.field}`}>
              {field.label}: <del>{field.old || '—'}</del> <span className="diff-arrow">→</span>{' '}
              <ins>{field.new || '—'}</ins>
            </p>
          ))
        ) : (
          <p className="diff">{change.change_type === 'removed' ? 'пара отменена' : 'пара появилась в расписании'}</p>
        )}
        {link ? (
          <Link className="link-btn change-open" to={link}>
            Открыть пару
          </Link>
        ) : null}
        <span className="sr-only">{relativeDate(day)}</span>
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

      {grouped.map(([day, list]) => (
        <section className="change-day" key={day} aria-label={dayHeading(day)}>
          <div className="change-day-head">{dayHeading(day)}</div>
          {list.map((change) => <ChangeItem key={change.id} change={change} groupId={groupId} />)}
        </section>
      ))}

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
      <p className="footnote">Изменения копятся с момента последней синхронизации. <Link to={`/g/${groupId}/settings`}>Подписаться на уведомления</Link></p>
    </>
  );
}
