import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useEntityInfo, useRecentChanges, useWeekSchedule } from '../api/queries';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import { DetailSheet } from '../components/DetailSheet';
import {
  lessonCountLabel,
  lessonDate,
  plural,
  shortDay,
  slotsOf,
  todayISO,
  weekDays,
  type Slot,
} from '../lib/schedule';
import { currentWeekStart, weekRangeLabel } from '../lib/date';
import { usePageMeta } from '../lib/usePageMeta';
import type { Day } from '../api/types';

export function EntityPage({ type, id }: { type: 'tutor' | 'auditory'; id: number }) {
  const isDesktop = useIsDesktop();
  const savedGroup = usePreferences((state) => state.group);
  const groupName = savedGroup?.id ? savedGroup.name : '';
  const week = useWeekSchedule(type, id, currentWeekStart());
  const info = useEntityInfo(type, id);
  const recent = useRecentChanges(type, id);
  const [detail, setDetail] = useState<{ iso: string; slot: Slot } | null>(null);

  const days = weekDays(currentWeekStart());
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
  const pairLabel = week.data ? ` · ${pairCount} ${plural(pairCount, 'пара', 'пары', 'пар')} на этой неделе` : '';
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
        <Link className="back-link" to={savedGroup ? `/g/${savedGroup.id}/today` : '/search'}>
          <ArrowLeft size={15} strokeWidth={1.6} /> К расписанию группы
        </Link>
        <h1 className="entity-title">{title}</h1>
        <p className="entity-meta">{meta}</p>
      </div>
      <div className="section-head">
        <h2 className="section-title">Эта неделя</h2>
        <span className="section-note">{weekRangeLabel(currentWeekStart())}</span>
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
                <button className="wrow wrow-btn" type="button" key={slot.pair} onClick={() => openSlot(iso, slot)} aria-haspopup="dialog">
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
        Расписание может меняться. <Link to={savedGroup ? `/g/${savedGroup.id}/changes` : '/search'}>Смотреть изменения</Link>
      </p>
      <DetailSheet
        open={Boolean(detail)}
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
