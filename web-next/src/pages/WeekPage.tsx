import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DetailSheet } from '../components/DetailSheet';
import { WeekGrid, WeekList } from '../components/Schedule';
import { useGroupName, useRecentChanges, useWeekSchedule } from '../api/queries';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import type { Day } from '../api/types';
import {
  dayLabel,
  lessonCountLabel,
  lessonDate,
  plural,
  slotsOf,
  todayISO,
  weekDays,
  type Slot,
} from '../lib/schedule';
import { addDaysISO, currentWeekStart, weekRangeLabel } from '../lib/date';

export function WeekPage({ groupId }: { groupId: number }) {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const subgroup = usePreferences((state) => state.subgroup);
  const setSubgroup = usePreferences((state) => state.setSubgroup);
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const rawWeekStart = params.get('week_start');
  const weekStart = rawWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart) ? rawWeekStart : currentWeekStart();
  const week = useWeekSchedule('group', groupId, weekStart);
  const recent = useRecentChanges('group', groupId, subgroup);
  const [detail, setDetail] = useState<{ iso: string; slot: Slot } | null>(null);

  const days = weekDays(weekStart);
  const schedule = useMemo(() => {
    const map = new Map<string, Day>();
    week.data?.forEach((day) => map.set(lessonDate(day), day));
    return map;
  }, [week.data]);
  const changedIds = useMemo(() => new Set(recent.data?.map((item) => item.lesson_id) || []), [recent.data]);
  const changedByLesson = useMemo(
    () => new Map(recent.data?.map((item) => [item.lesson_id, item]) || []),
    [recent.data],
  );
  const selectedDay = days.includes(params.get('day') || '')
    ? (params.get('day') as string)
    : days.includes(todayISO())
      ? todayISO()
      : days[0];
  const selectedSlots = schedule.get(selectedDay)
    ? slotsOf(schedule.get(selectedDay)!, subgroup, changedIds).filter((slot) => slot.entries.length > 0)
    : [];
  const selectedChanges = recent.data?.filter((change) => change.day === selectedDay) || [];
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const isNowSlot = (slot: Slot) => {
    if (selectedDay !== todayISO()) return false;
    const [startHour, startMinute] = slot.start.split(':').map(Number);
    const [endHour, endMinute] = slot.end.split(':').map(Number);
    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return nowMinutes >= start && nowMinutes < end;
  };
  const totalPairs = days.reduce((count, iso) => {
    const day = schedule.get(iso);
    return count + (day ? slotsOf(day, subgroup, changedIds).filter((slot) => !slot.window).length : 0);
  }, 0);

  const shiftWeek = (direction: number) => {
    const next = new URLSearchParams(params);
    next.set('week_start', addDaysISO(weekStart, direction * 7));
    next.delete('day');
    setParams(next, { replace: true });
  };

  const openSlot = (iso: string, slot: Slot) => setDetail({ iso, slot });

  useEffect(() => {
    const rawSlot = params.get('slot');
    if (!rawSlot) return;
    const pair = Number(rawSlot);
    if (!pair) return;
    const targetDay = params.get('day') || selectedDay;
    const day = schedule.get(targetDay);
    if (!day) return;
    const slot = slotsOf(day, subgroup, changedIds).find((item) => item.pair === pair);
    if (!slot) return;
    setDetail({ iso: targetDay, slot });
    const next = new URLSearchParams(params);
    next.delete('slot');
    setParams(next, { replace: true });
  }, [params, schedule, selectedDay, subgroup, changedIds, setParams]);

  if (week.isLoading) {
    return <div className="skeleton-list">{Array.from({ length: 6 }, (_, index) => <div className="skeleton-row" key={index} />)}</div>;
  }

  if (week.isError) {
    return (
      <div className="retry-wrap">
        <p>Не удалось загрузить неделю. Проверьте сеть и попробуйте ещё раз.</p>
        <button className="retry-btn" type="button" onClick={() => week.refetch()}>Повторить</button>
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <>
        <div className="week-head">
          <h1 className="week-range">{weekRangeLabel(weekStart)}</h1>
          <div className="week-arrows">
            <button className="arrow-btn" type="button" aria-label="Предыдущая неделя" onClick={() => shiftWeek(-1)}>
              <ChevronLeft size={18} strokeWidth={1.6} />
            </button>
            <button className="arrow-btn" type="button" aria-label="Следующая неделя" onClick={() => shiftWeek(1)}>
              <ChevronRight size={18} strokeWidth={1.6} />
            </button>
          </div>
        </div>
        <WeekList
          days={days}
          schedule={schedule}
          subgroup={subgroup}
          changedIds={changedIds}
          onOpen={openSlot}
          onClearSubgroup={() => setSubgroup('')}
        />
        <p className="footnote">
          Неделя начинается с понедельника. <Link to={`/g/${groupId}/settings`}>Настроить уведомления</Link>
        </p>
        <DetailSheet
          open={Boolean(detail)}
          dayISO={detail?.iso || selectedDay}
          slot={detail?.slot || null}
          groupName={groupName}
          changesByLesson={changedByLesson}
          onClose={() => setDetail(null)}
        />
      </>
    );
  }

  return (
    <>
      <header className="desk-top">
        <div className="desk-title">
          <h1 className="desk-group">{groupName}</h1>
          <div className="desk-sub">
            {subgroup ? `подгруппа ${subgroup} · ` : ''}
            {totalPairs} {plural(totalPairs, 'пара', 'пары', 'пар')} на неделе
          </div>
        </div>
        <div className="desk-tools">
          <div className="week-switch">
            <button className="arrow-btn" type="button" aria-label="Предыдущая неделя" onClick={() => shiftWeek(-1)}>
              <ChevronLeft size={18} strokeWidth={1.6} />
            </button>
            <span className="label">{weekRangeLabel(weekStart)}</span>
            <button className="arrow-btn" type="button" aria-label="Следующая неделя" onClick={() => shiftWeek(1)}>
              <ChevronRight size={18} strokeWidth={1.6} />
            </button>
          </div>
          <span className="desk-updated"><i className="dot" />обновлено недавно</span>
        </div>
      </header>
      <div className="desk-body">
        <div className="week-wrap">
          <WeekGrid
            days={days}
            schedule={schedule}
            subgroup={subgroup}
            changedIds={changedIds}
            onOpen={openSlot}
          />
        </div>
        <aside className="aside" aria-label="Детали дня">
          <div>
            <h2 className="aside-title">{dayLabel(selectedDay)}</h2>
            <p className="aside-sub">
              {selectedSlots.length} {plural(selectedSlots.length, 'пара', 'пары', 'пар')}
              {selectedSlots[0] ? ` · ${selectedSlots[0].start}–${selectedSlots[selectedSlots.length - 1].end}` : ''}
            </p>
            <div className="aside-block">
              <ul className="aside-list">
                {selectedSlots.length ? selectedSlots.map((slot) => (
                  <li key={slot.pair}>
                    <button
                      className={`aside-item${isNowSlot(slot) ? ' is-now' : ''}`}
                      type="button"
                      onClick={() => openSlot(selectedDay, slot)}
                    >
                      <span className="p">{slot.pair}</span>
                      <span className="aside-body">
                        <span className="s">
                          {slot.entries.length > 1 ? lessonCountLabel(slot.entries.length) : slot.entries[0]?.subject}
                        </span>
                        <span className="m">
                          {slot.start}–{slot.end} · {Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ')}
                          {slot.entries.some((entry) => entry.changed) ? ' · замена' : ''}
                        </span>
                      </span>
                    </button>
                  </li>
                )) : <li className="aside-item"><span /><span className="m">Занятий нет</span></li>}
              </ul>
            </div>
          </div>
          <div>
            <h2 className="aside-title" style={{ fontSize: 14 }}>Изменения</h2>
            <div className="aside-block">
              {selectedChanges.length ? (
                <>
                  {selectedChanges.slice(0, 2).map((change) => (
                    <Link className="aside-change" to={`/g/${groupId}/changes`} key={change.id}>
                      <div className="ac-subject">
                        {change.subject || 'Изменение'} · {change.pair ? `${change.pair} пара` : ''}
                      </div>
                      <div className="ac-text">
                        {change.changes?.[0] ? `${change.changes[0].label}: ${change.changes[0].old} → ${change.changes[0].new}` : change.change_type}
                      </div>
                    </Link>
                  ))}
                  <Link className="aside-link" to={`/g/${groupId}/changes`}>
                    Все изменения <ChevronRight size={14} strokeWidth={1.6} />
                  </Link>
                </>
              ) : (
                <p className="aside-sub">Изменений нет.</p>
              )}
            </div>
          </div>
          <div>
            <h2 className="aside-title" style={{ fontSize: 14 }}>Уведомления</h2>
            <p className="aside-sub" style={{ marginTop: 4 }}>
              Подписка на изменения этой группы. Дайджест приходит в 19:00.
            </p>
            <Link className="aside-link" to={`/g/${groupId}/settings`}>
              Настроить <ChevronRight size={14} strokeWidth={1.6} />
            </Link>
          </div>
        </aside>
      </div>
      <DetailSheet
        open={Boolean(detail)}
        dayISO={detail?.iso || selectedDay}
        slot={detail?.slot || null}
        groupName={groupName}
        changesByLesson={changedByLesson}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
