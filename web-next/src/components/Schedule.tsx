import type { Slot, SlotEntry } from '../lib/schedule';
import { slotsOf as slotsFor, subgroupLabel, lessonCountLabel, TIME_SLOTS as TIME, todayISO, shortDay, weekdayFull } from '../lib/schedule';
import { ChevronRight } from 'lucide-react';

export function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: string[];
  selected: string;
  onSelect: (iso: string) => void;
}) {
  return (
    <div className="daystrip" role="group" aria-label="День недели">
      {days.map((iso) => {
        const info = shortDay(iso);
        return (
          <button
            key={iso}
            className="day-cell"
            type="button"
            aria-pressed={iso === selected}
            onClick={() => onSelect(iso)}
          >
            <span className="day-name">{info.weekday}</span>
            <span className="day-num">{info.day}</span>
            {info.today ? <span className="today-mark" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function NowBand({
  slot,
  mode,
  progress,
  remaining,
  onOpen,
}: {
  slot: Slot;
  mode: 'now' | 'next';
  progress?: number;
  remaining?: number;
  onOpen: () => void;
}) {
  const multi = slot.entries.length > 1;
  const first = slot.entries[0];
  const names = slot.entries.map((entry) => entry.subject).join(' · ');
  const rooms = Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ');
  return (
    <section className="now-band" aria-label={mode === 'now' ? 'Сейчас идёт' : 'Следующая пара'}>
      <div className="now-head">
        <span className="now-chip">{mode === 'now' ? 'сейчас' : 'далее'}</span>
        <span className="now-slot">
          {slot.pair} пара · {slot.start}–{slot.end}
        </span>
        <button className="now-detail" type="button" onClick={onOpen}>
          Детали <ChevronRight size={14} strokeWidth={1.6} />
        </button>
      </div>
      <h1 className="now-subject">{multi ? lessonCountLabel(slot.entries.length) : first?.subject}</h1>
      <p className="now-meta">
        {multi ? (
          <>
            {names} · <b>{rooms}</b>
          </>
        ) : first && first.variants.length > 1 ? (
          <>{first.kind}</>
        ) : (
          <>
            {first?.kind} · ауд. <b>{first?.room}</b> · {first?.teacher}
          </>
        )}
      </p>
      <p className="now-left">
        {mode === 'now' ? `до конца ${remaining ?? 0} мин` : `начнётся в ${slot.start}`}
      </p>
      {mode === 'now' ? (
        <span className="now-progress" aria-hidden="true">
          <i style={{ width: `${progress ?? 0}%` }} />
        </span>
      ) : null}
    </section>
  );
}

function SlotMeta({ entry }: { entry: SlotEntry }) {
  if (entry.variants.length > 1) {
    return <span className="kind">{entry.kind}</span>;
  }
  return (
    <>
      <span className="kind">{entry.kind}</span> · ауд. <b>{entry.room}</b>
      {entry.teacher ? ` · ${entry.teacher}` : ''}
    </>
  );
}

export function SlotRow({ slot, onOpen }: { slot: Slot; onOpen: () => void }) {
  if (slot.window) {
    return (
      <li className="lesson is-window">
        <span className="time-col">
          <span className="pair-no">{slot.pair}</span>
          <span className="t">{slot.start}</span>
          <span className="t">{slot.end}</span>
        </span>
        <p className="window-text">окно · 1 ч 35 мин</p>
      </li>
    );
  }

  const multi = slot.entries.length > 1;
  const changed = slot.entries.some((entry) => entry.changed);
  return (
    <li>
      <button className="lesson lesson-btn" type="button" onClick={onOpen} aria-haspopup="dialog">
        <span className="time-col">
          <span className="pair-no">{slot.pair}</span>
          <span className="t">{slot.start}</span>
          <span className="t">{slot.end}</span>
        </span>
        <span className="lesson-body">
          <span className="lesson-top">
            <span className="subject">{multi ? lessonCountLabel(slot.entries.length) : slot.entries[0]?.subject}</span>
            <span className="lesson-right">
              {changed ? <span className="change-flag">замена</span> : null}
              <span className="lesson-chevron">
                <ChevronRight size={16} strokeWidth={1.6} />
              </span>
            </span>
          </span>
          {multi ? (
            <>
              <span className="slot-line">{slot.entries.map((entry) => entry.subject).join(' · ')}</span>
              <span className="meta">
                {Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ')}
              </span>
            </>
          ) : slot.entries[0] ? (
            <>
              <span className="meta">
                <SlotMeta entry={slot.entries[0]} />
              </span>
              {slot.entries[0].subgroups.length ? (
                <span className="chip">
                  {slot.entries[0].subgroups[0]} подгруппа
                </span>
              ) : null}
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}

export function WeekList({
  days,
  schedule,
  subgroup,
  changedIds,
  onOpen,
  onClearSubgroup,
}: {
  days: string[];
  schedule: Map<string, import('../api/types').Day>;
  subgroup: string;
  changedIds: Set<number>;
  onOpen: (iso: string, slot: Slot) => void;
  onClearSubgroup?: () => void;
}) {
  return (
    <>
      {days.map((iso) => {
        const day = schedule.get(iso);
        const slots = day ? slotsFor(day, subgroup, changedIds) : [];
        const today = iso === todayISO();
        const changed = slots.some((slot) => slot.entries.some((entry) => entry.changed));
        return (
          <section className={`wday${today ? ' is-today' : ''}`} key={iso} aria-label={iso}>
            <div className="wday-head">
              <span className="wday-num">{new Date(`${iso}T00:00:00`).getDate()}</span>
              <span className="wday-name">{weekdayFull(iso)}</span>
              <span className="wday-date">{changed ? <span className="change-flag">замена</span> : ''}</span>
            </div>
            {slots.length ? (
              slots.map((slot) =>
                slot.window ? (
                  <div className="wrow" key={`${iso}-${slot.pair}`}>
                    <span className="wrow-time">{slot.start}</span>
                    <span className="wrow-subject" style={{ color: 'var(--muted)' }}>
                      окно
                    </span>
                    <span className="wrow-room">{slot.end}</span>
                  </div>
                ) : (
                  <button
                    className="wrow wrow-btn"
                    type="button"
                    key={`${iso}-${slot.pair}`}
                    onClick={() => onOpen(iso, slot)}
                    aria-haspopup="dialog"
                  >
                    <span className="wrow-time">{slot.start}</span>
                    <span className="wrow-subject">
                      {slot.entries.length > 1 ? lessonCountLabel(slot.entries.length) : slot.entries[0]?.subject}
                      {slot.entries.some((entry) => entry.changed) ? (
                        <span className="change-flag">замена</span>
                      ) : null}
                    </span>
                    <span className="wrow-room">
                      {slot.entries.length === 1 && slot.entries[0].variants.length > 1
                        ? 'по выбору'
                        : Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ')}
                    </span>
                    <span className="wrow-sub">
                      {slot.entries.length > 1
                        ? slot.entries.map((entry) => entry.subject).join(' · ')
                        : `${slot.entries[0]?.kind}${subgroupLabel(slot.entries[0]) ? ` · ${subgroupLabel(slot.entries[0])}` : ''}`}
                    </span>
                    <span className="wrow-chevron" aria-hidden="true">
                      <ChevronRight size={16} strokeWidth={1.6} />
                    </span>
                  </button>
                ),
              )
            ) : (
              <div className="wrow">
                <span className="wrow-time">—</span>
                <span className="wrow-subject" style={{ color: 'var(--muted)' }}>
                  {subgroup ? (
                    <>
                      нет занятий для подгруппы {subgroup}.{' '}
                      {onClearSubgroup ? (
                        <button className="link-btn" type="button" onClick={onClearSubgroup}>
                          Показать все
                        </button>
                      ) : null}
                    </>
                  ) : (
                    'занятий нет'
                  )}
                </span>
                <span className="wrow-room" />
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

export function WeekGrid({
  days,
  schedule,
  subgroup,
  changedIds,
  onOpen,
}: {
  days: string[];
  schedule: Map<string, import('../api/types').Day>;
  subgroup: string;
  changedIds: Set<number>;
  onOpen: (iso: string, slot: Slot) => void;
}) {
  const cellSlots = new Map<string, Map<number, Slot>>();
  days.forEach((iso) => {
    const day = schedule.get(iso);
    const map = new Map<number, Slot>();
    if (day) slotsFor(day, subgroup, changedIds).forEach((slot) => map.set(slot.pair, slot));
    cellSlots.set(iso, map);
  });

  return (
    <div className="week-grid" aria-label="Расписание на неделю">
      <div className="wk-corner" aria-hidden="true" />
      {days.map((iso) => {
        const info = shortDay(iso);
        const today = iso === todayISO();
        return (
          <div className={`wk-head${today ? ' is-today' : ''}`} key={`h-${iso}`}>
            <span className="dn">{info.weekday}</span>
            <span className="dd">{info.day}</span>
          </div>
        );
      })}
      {Array.from({ length: 8 }, (_, index) => index + 1).map((pair) => (
        <div key={`row-${pair}`} style={{ display: 'contents' }}>
          <div className="wk-time">
            <span className="n">{pair}</span>
            <span className="s">{TIME[pair]?.start}</span>
          </div>
          {days.map((iso) => {
            const slot = cellSlots.get(iso)?.get(pair);
            const today = iso === todayISO();
            return (
              <div className={`wk-cell${today ? ' is-today' : ''}`} key={`${iso}-${pair}`}>
                {slot?.window ? <span className="wk-window">окно</span> : null}
                {slot && !slot.window && slot.entries.length ? (
                  <button
                    className={`wk-item${slot.entries.length > 1 ? ' is-multi' : ''}${
                      slot.entries.some((entry) => entry.changed) ? ' is-change' : ''
                    }`}
                    type="button"
                    onClick={() => onOpen(iso, slot)}
                    aria-haspopup="dialog"
                  >
                    <span className="s">
                      {slot.entries.length > 1 ? lessonCountLabel(slot.entries.length) : slot.entries[0]?.subject}
                    </span>
                    <span className="m">
                      {slot.entries.length > 1
                        ? Array.from(new Set(slot.entries.map((entry) => entry.room))).join(', ')
                        : slot.entries[0]?.variants.length > 1
                          ? 'по выбору'
                          : `${slot.entries[0]?.room} · ${slot.entries[0]?.kind}`}
                    </span>
                    {slot.entries.some((entry) => entry.changed) ? (
                      <span className="f">замена</span>
                    ) : null}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

