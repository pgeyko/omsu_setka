import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLink } from '../components/AppLink';
import { ArrowLeft, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { useEntityInfo, useRecentChanges, useWeekSchedule } from '../api/queries';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import { DetailSheet } from '../components/DetailSheet';
import {
  lessonCountLabel,
  lessonDate,
  plural,
  shortDay,
  slotMinutes,
  slotsOf,
  todayISO,
  weekDays,
  type Slot,
} from '../lib/schedule';
import { addDaysISO, currentWeekStart, weekRangeLabel } from '../lib/date';
import { usePageMeta } from '../lib/usePageMeta';
import { useNow } from '../lib/useNow';
import type { Day } from '../api/types';

export function EntityPage({ type, id }: { type: 'tutor' | 'auditory'; id: number }) {
  const isDesktop = useIsDesktop();
  const [params, setParams] = useSearchParams();
  const savedGroup = usePreferences((state) => state.group);
  const groupName = savedGroup?.id ? savedGroup.name : '';
  const rawWeekStart = params.get('week_start');
  const weekStart = rawWeekStart && /^\d{4}-\d{2}-\d{2}$/.test(rawWeekStart) ? rawWeekStart : currentWeekStart();
  const week = useWeekSchedule(type, id, weekStart);
  const info = useEntityInfo(type, id);
  const recent = useRecentChanges(type, id);
  const [detail, setDetail] = useState<{ iso: string; slot: Slot } | null>(null);

  const shiftWeek = (direction: number) => {
    const next = new URLSearchParams(params);
    next.set('week_start', addDaysISO(weekStart, direction * 7));
    setParams(next, { replace: true });
  };

  const days = weekDays(weekStart);
  const schedule = useMemo(() => {
    const map = new Map<string, Day>();
    week.data?.forEach((day) => map.set(lessonDate(day), day));
    return map;
  }, [week.data]);
  const changedIds = useMemo(() => new Set(recent.data?.map((item) => item.lesson_id) || []), [recent.data]);
  const changesByLesson = useMemo(
    () => new Map(recent.data?.map((item) => [item.lesson_id, item]) || []),
    [recent.data],
  );
  const title = info.data?.name || (type === 'tutor' ? `Преподаватель ${id}` : `Аудитория ${id}`);
  usePageMeta(`${title} — сетка`, type === 'tutor' ? `Расписание преподавателя ${title}.` : `Расписание аудитории ${title}.`);
  const pairCount = days.reduce((count, iso) => {
    const day = schedule.get(iso);
    return count + (day ? slotsOf(day, '', changedIds).filter((slot) => !slot.window).length : 0);
  }, 0);
  const pairLabel = week.data ? ` · ${pairCount} ${plural(pairCount, 'пара', 'пары', 'пар')} на неделе` : '';
  const now = useNow();
  const todaySlots = useMemo(() => {
    if (type !== 'auditory') return [];
    const day = schedule.get(todayISO());
    return day ? slotsOf(day, '', changedIds).filter((slot) => !slot.window && slot.entries.length > 0) : [];
  }, [type, schedule, changedIds]);
  const status = useMemo(() => {
    if (type !== 'auditory' || !week.data || !days.includes(todayISO())) return null;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const current = todaySlots.find((slot) => {
      const minutes = slotMinutes(slot);
      return minutes.start <= nowMinutes && nowMinutes < minutes.end;
    });
    if (current) return { busy: true, text: `Занята до ${current.end}` };
    const next = todaySlots.find((slot) => slotMinutes(slot).start > nowMinutes);
    if (next) return { busy: false, text: `Свободна до ${next.start}` };
    if (todaySlots.length) return { busy: false, text: 'На сегодня пар больше нет' };
    return { busy: false, text: 'Сегодня занятий нет' };
  }, [type, week.data, todaySlots, now, days]);
  const building = type === 'auditory' && info.data && 'building' in info.data
    ? (info.data as { building?: string }).building
    : '';
  const buildingLabel = building && building !== '0' ? ` · корпус ${building}` : '';
  const meta = type === 'tutor'
    ? `преподаватель${pairLabel}`
    : `аудитория${buildingLabel}${pairLabel}`;

  const openSlot = (iso: string, slot: Slot) => setDetail({ iso, slot });

  const content = (
    <>
      <div className="entity-head">
        <AppLink className="back-link" to={savedGroup ? `/g/${savedGroup.id}/today` : '/search'} animate={false}>
          <ArrowLeft size={15} strokeWidth={1.6} /> К расписанию группы
        </AppLink>
        <h1 className="entity-title">{title}</h1>
        <p className="entity-meta">{meta}</p>
        {status ? (
          <p className={`entity-status${status.busy ? ' is-busy' : ''}`}>{status.text}</p>
        ) : null}
        {type === 'auditory' && building && building !== '0' ? (
          <AppLink className="entity-map-link" to={`/map?building=${encodeURIComponent(building)}`}>
            <MapPin size={14} strokeWidth={1.6} aria-hidden /> Свободные аудитории корпуса
          </AppLink>
        ) : null}
      </div>
      <div className="week-head entity-week-head">
        <h2 className="week-range">{weekRangeLabel(weekStart)}</h2>
        <div className="week-arrows">
          <button className="arrow-btn" type="button" aria-label="Предыдущая неделя" onClick={() => shiftWeek(-1)}>
            <ChevronLeft size={18} strokeWidth={1.6} />
          </button>
          <button className="arrow-btn" type="button" aria-label="Следующая неделя" onClick={() => shiftWeek(1)}>
            <ChevronRight size={18} strokeWidth={1.6} />
          </button>
        </div>
      </div>
      <div className="section-head">
        <h2 className="section-title">Эта неделя</h2>
        <span className="section-note">{pairCount ? `${pairCount} ${plural(pairCount, 'пара', 'пары', 'пар')}` : 'свободно'}</span>
      </div>
      {days.map((iso) => {
        const day = schedule.get(iso);
        const slots = day ? slotsOf(day, '', changedIds).filter((slot) => slot.entries.length > 0) : [];
        if (!slots.length) return null;
        return (
          <section className={`wday${iso === todayISO() ? ' is-today' : ''}`} key={iso} aria-label={iso}>
            <div className="wday-head">
              <span className="wday-num">{new Date(`${iso}T00:00:00`).getDate()}</span>
              <span className="wday-name">{shortDay(iso).weekday}</span>
              <span className="wday-date" />
            </div>
            {slots.map((slot) => {
              const multi = slot.entries.length > 1;
              const rooms = Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ');
              const right = Array.from(
                new Set(
                  slot.entries.map((entry) => (type === 'tutor' ? entry.lesson.group : entry.teacher)),
                ),
              ).join(', ');
              return (
                <button className="wrow wrow-btn wrow-entity" type="button" key={slot.pair} onClick={() => openSlot(iso, slot)} aria-haspopup="dialog">
                  <span className="wrow-time">{slot.start}</span>
                  <span className="wrow-subject">{multi ? lessonCountLabel(slot.entries.length) : slot.entries[0]?.subject}</span>
                  <span className="wrow-room">{right}</span>
                  <span className="wrow-sub">
                    {multi ? `${rooms} · ${slot.pair} пара` : `${slot.entries[0]?.kind} · ${rooms} · ${slot.pair} пара`}
                  </span>
                  <span className="wrow-chevron" aria-hidden="true"><ChevronRight size={16} strokeWidth={1.6} /></span>
                </button>
              );
            })}
          </section>
        );
      })}
      {week.isError ? <p className="empty-search">Не удалось загрузить расписание.</p> : null}
      <p className="footnote">
        Расписание может меняться. <AppLink to={savedGroup ? `/g/${savedGroup.id}/changes` : '/search'}>Смотреть изменения</AppLink>
      </p>
      <DetailSheet
        dayISO={detail?.iso || todayISO()}
        slot={detail?.slot || null}
        groupName={groupName || title}
        changesByLesson={changesByLesson}
        onClose={() => setDetail(null)}
      />
    </>
  );

  if (isDesktop) {
    return (
      <>
        <header className="desk-top">
          <div className="desk-title"><h1 className="desk-group">{title}</h1><div className="desk-sub">{meta}</div></div>
        </header>
        <div className="desk-body is-single">
          <div className="desk-page">{content}</div>
        </div>
      </>
    );
  }
  return content;
}
