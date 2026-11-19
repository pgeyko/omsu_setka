import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DayStrip, NowBand, SlotRow } from '../components/Schedule';
import { DetailSheet } from '../components/DetailSheet';
import { useGroupName, useRecentChanges, useWeekSchedule } from '../api/queries';
import { usePageMeta } from '../lib/usePageMeta';
import { runViewTransition } from '../lib/viewTransition';
import { usePreferences } from '../store/preferences';
import type { Day } from '../api/types';
import {
  dayMonthLabel,
  lessonDate,
  plural,
  slotsOf,
  todayISO,
  weekDays,
  weekdayTitle,
  type Slot,
} from '../lib/schedule';
import { currentWeekStart, nextSchoolDay, weekStartForDate } from '../lib/date';

function clockDate(override?: string | null): Date {
  const date = new Date();
  if (import.meta.env.DEV && override && /^\d{2}:\d{2}$/.test(override)) {
    const [hours, minutes] = override.split(':').map(Number);
    if (hours < 24 && minutes < 60) date.setHours(hours, minutes, 0, 0);
  }
  return date;
}

function useClock(override?: string | null) {
  const [now, setNow] = useState(() => clockDate(override));
  useEffect(() => {
    const timer = window.setInterval(() => setNow(clockDate(override)), 30_000);
    return () => window.clearInterval(timer);
  }, [override]);
  return now;
}

function slotMinutes(slot: Slot): { start: number; end: number } {
  const parse = (value: string) => {
    const [h, m] = value.split(':').map(Number);
    return h * 60 + m;
  };
  return { start: parse(slot.start), end: parse(slot.end) };
}

export function TodayPage({ groupId }: { groupId: number }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const subgroup = usePreferences((state) => state.subgroup);
  const setSubgroup = usePreferences((state) => state.setSubgroup);
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const now = useClock(params.get('now'));
  const rawDay = params.get('day');
  const selectedParam = rawDay && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : null;
  const baseWeekStart = selectedParam ? weekStartForDate(selectedParam) : currentWeekStart();
  const baseWeek = useWeekSchedule('group', groupId, baseWeekStart);
  const recent = useRecentChanges('group', groupId, subgroup);
  const [detail, setDetail] = useState<{ iso: string; slot: Slot } | null>(null);

  const today = todayISO();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const changedIds = useMemo(() => new Set(recent.data?.map((item) => item.lesson_id) || []), [recent.data]);
  const changedByLesson = useMemo(
    () => new Map(recent.data?.map((item) => [item.lesson_id, item]) || []),
    [recent.data],
  );

  const baseSchedule = useMemo(() => {
    const map = new Map<string, Day>();
    baseWeek.data?.forEach((item) => map.set(lessonDate(item), item));
    return map;
  }, [baseWeek.data]);
  const baseTodaySlots = baseSchedule.get(today)
    ? slotsOf(baseSchedule.get(today)!, subgroup, changedIds).filter((slot) => !slot.window)
    : [];
  const todayFinished =
    baseTodaySlots.length > 0 && baseTodaySlots.every((slot) => slotMinutes(slot).end <= nowMinutes);
  const after18 = nowMinutes >= 18 * 60;
  const todayIsSunday = new Date(`${today}T00:00:00`).getDay() === 0;
  const autoMode = !selectedParam;
  const nextDay = todayIsSunday || todayFinished || after18 ? nextSchoolDay(today) : null;
  const autoTarget = autoMode ? nextDay : null;
  const targetWeekStart = autoTarget ? weekStartForDate(autoTarget) : baseWeekStart;
  const targetWeek = useWeekSchedule('group', groupId, targetWeekStart, targetWeekStart !== baseWeekStart);
  const activeWeek = targetWeekStart === baseWeekStart ? baseWeek : targetWeek;
  const days = weekDays(targetWeekStart);
  const schedule = useMemo(() => {
    const map = new Map<string, Day>();
    activeWeek.data?.forEach((dayData) => map.set(lessonDate(dayData), dayData));
    return map;
  }, [activeWeek.data]);

  const selected =
    selectedParam && days.includes(selectedParam)
      ? selectedParam
      : autoTarget && days.includes(autoTarget)
        ? autoTarget
        : days.includes(today)
          ? today
          : days[0];
  const day = schedule.get(selected);
  const slots = day ? slotsOf(day, subgroup, changedIds) : [];
  const isToday = selected === today;
  usePageMeta(
    `${groupName} — ${isToday ? 'сегодня' : weekdayTitle(selected).toLowerCase()} — сетка`,
    `Расписание ${groupName}${isToday ? ' на сегодня' : ''}: пары, аудитории и замены.`,
  );
  const current = isToday
    ? slots.find((slot) => {
        if (slot.window) return false;
        const { start, end } = slotMinutes(slot);
        return nowMinutes >= start && nowMinutes < end;
      })
    : undefined;
  const next = isToday
    ? slots.find((slot) => {
        if (slot.window) return false;
        return slotMinutes(slot).start > nowMinutes;
      })
    : undefined;
  const progress = current
    ? Math.round(((nowMinutes - slotMinutes(current).start) / (slotMinutes(current).end - slotMinutes(current).start)) * 100)
    : 0;
  const remaining = current ? slotMinutes(current).end - nowMinutes : 0;
  const pastSlots = isToday
    ? slots.filter((slot) => !slot.window && slotMinutes(slot).end <= nowMinutes)
    : [];

  const visible = isToday
    ? current
      ? slots.filter((slot) => slot.pair > current.pair)
      : next
        ? slots.filter((slot) => slot.pair > next.pair)
        : []
    : slots;
  const realCount = visible.filter((slot) => !slot.window).length;
  const windows = visible.filter((slot) => slot.window).length;
  const daySlots = slots.filter((slot) => !slot.window);
  const dayFirst = daySlots[0];
  const dayLast = daySlots[daySlots.length - 1];
  const visibleLast = visible[visible.length - 1];
  const countText = realCount
    ? `${realCount} ${plural(realCount, 'пара', 'пары', 'пар')}${windows ? ` и ${windows} ${plural(windows, 'окно', 'окна', 'окон')}` : ''}`
    : 'свободно';

  const selectDay = (iso: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('day', iso);
    setParams(nextParams, { replace: true });
  };

  const useAutoDay = () => {
    const nextParams = new URLSearchParams(params);
    nextParams.delete('day');
    setParams(nextParams, { replace: true });
  };

  if (activeWeek.isLoading) {
    return (
      <div className="skeleton-list" aria-label="Загрузка расписания">
        {Array.from({ length: 5 }, (_, index) => (
          <div className="skeleton-row" key={index} />
        ))}
      </div>
    );
  }

  if (activeWeek.isError) {
    return (
      <div className="retry-wrap">
        <p>Не удалось загрузить расписание. Проверьте сеть и попробуйте ещё раз.</p>
        <button className="retry-btn" type="button" onClick={() => activeWeek.refetch()}>
          Повторить
        </button>
      </div>
    );
  }

  return (
    <>
      <DayStrip days={days} selected={selected} onSelect={selectDay} />
      <div className="day-view" key={`${selected}-${subgroup}`}>
      {autoTarget ? (
        <div className="next-day-note" role="status">
          <span>
            {todayIsSunday
              ? 'Сегодня воскресенье.'
              : todayFinished
                ? 'Занятия на сегодня закончились.'
                : 'Уже после 18:00.'}{' '}
            Показано расписание на {dayMonthLabel(autoTarget)}.
          </span>
          <button className="link-btn" type="button" onClick={() => selectDay(today)}>
            Показать сегодня
          </button>
        </div>
      ) : nextDay && selected === today ? (
        <div className="next-day-note" role="status">
          <span>Показано расписание на сегодня.</span>
          <button className="link-btn" type="button" onClick={useAutoDay}>
            Показать {dayMonthLabel(nextDay)}
          </button>
        </div>
      ) : null}
      {current ? (
        <NowBand
          slot={current}
          mode="now"
          progress={progress}
          remaining={remaining}
          onOpen={() => setDetail({ iso: selected, slot: current })}
        />
      ) : next ? (
        <NowBand
          slot={next}
          mode="next"
          onOpen={() => setDetail({ iso: selected, slot: next })}
        />
      ) : (
        <section className="now-band" aria-label={weekdayTitle(selected)}>
          <div className="now-head">
            <span className="now-chip">{weekdayTitle(selected).slice(0, 2).toLowerCase()}</span>
            <span className="now-slot">{dayMonthLabel(selected)}</span>
          </div>
          <h1 className="now-subject">{weekdayTitle(selected)}</h1>
          <p className="now-meta">
            {daySlots.length} {plural(daySlots.length, 'пара', 'пары', 'пар')}
            {dayFirst ? ` · ${dayFirst.start}–${dayLast.end}` : ''} · <b>{groupName}</b>
          </p>
          <p className="now-left">
            {isToday && dayFirst ? 'занятия закончились' : dayFirst ? `первая пара в ${dayFirst.start}` : 'выходной'}
          </p>
        </section>
      )}

      <div className="section-head">
        <h2 className="section-title">{isToday ? 'Дальше сегодня' : 'Все пары'}</h2>
        <span className="section-note">
          {isToday ? countText : visibleLast ? `до ${visibleLast.end}` : 'свободно'}
        </span>
      </div>

      <ul className="lesson-list">
        {visible.length ? (
          visible.map((slot) => (
            <SlotRow key={`${selected}-${slot.pair}`} slot={slot} onOpen={() => setDetail({ iso: selected, slot })} />
          ))
        ) : (
          <li className="lesson">
            <span />
            <p className="window-text">
              {subgroup
                ? `Для подгруппы ${subgroup} занятий нет. `
                : isToday && slots.length
                  ? `${current || next ? 'После этой пары занятий больше нет.' : 'На сегодня пары закончились.'} `
                  : 'На этот день занятий нет. '}
              {subgroup ? (
                <button className="link-btn" type="button" onClick={() => setSubgroup('')}>
                  Показать все
                </button>
              ) : null}
            </p>
          </li>
        )}
      </ul>

      {pastSlots.length ? (
        <>
          <div className="section-head">
            <h2 className="section-title">Уже прошли</h2>
            <span className="section-note">
              {pastSlots.length} {plural(pastSlots.length, 'пара', 'пары', 'пар')}
            </span>
          </div>
          <ul className="lesson-list">
            {pastSlots.map((slot) => (
              <SlotRow
                key={`past-${selected}-${slot.pair}`}
                slot={slot}
                past
                onOpen={() => setDetail({ iso: selected, slot })}
              />
            ))}
          </ul>
        </>
      ) : null}

      <p className="footnote">
        Источник — расписание ОмГУ. Нажмите на пару, чтобы увидеть преподавателя и аудиторию. <button className="link-btn" type="button" onClick={() => runViewTransition(() => navigate(`/g/${groupId}/changes`))}>Что изменилось</button>
      </p>
      </div>

      <DetailSheet
        open={Boolean(detail)}
        dayISO={detail?.iso || selected}
        slot={detail?.slot || null}
        groupName={groupName}
        changesByLesson={changedByLesson}
        onClose={() => setDetail(null)}
      />
    </>
  );
}
