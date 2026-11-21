import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLink } from './AppLink';
import { X } from 'lucide-react';
import type { ScheduleChange } from '../api/types';
import type { Slot, SlotEntry } from '../lib/schedule';
import { dayLabel, lessonCountLabel, subgroupLabel, variantCountLabel } from '../lib/schedule';

interface DetailSheetProps {
  dayISO: string;
  slot: Slot | null;
  groupName: string;
  changesByLesson: Map<number, ScheduleChange>;
  onClose: () => void;
}

function entryChange(entry: SlotEntry, changes: Map<number, ScheduleChange>) {
  return changes.get(entry.lesson.id);
}

export function DetailSheet({ dayISO, slot, groupName, changesByLesson, onClose }: DetailSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const [rendered, setRendered] = useState<Slot | null>(slot);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);

  // Keep the last slot mounted for a moment so the sheet can animate out,
  // both on an explicit close and when a link inside it changes the page.
  useEffect(() => {
    if (slot) {
      window.clearTimeout(closeTimer.current);
      setRendered(slot);
      setClosing(false);
      return;
    }
    if (!rendered) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setRendered(null);
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setClosing(false);
      setRendered(null);
    }, 180);
    return () => window.clearTimeout(closeTimer.current);
  }, [slot, rendered]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !rendered) return;
    if (!dialog.open) dialog.showModal();
  }, [rendered]);

  if (!rendered) return null;

  const openLink = (to: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    onClose();
    window.setTimeout(() => navigate(to), 170);
  };

  return (
    <dialog
      ref={ref}
      className={`sheet${closing ? ' is-closing' : ''}`}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="sheet-head">
        <div className="sheet-head-text">
          <h2 className="sheet-title" id="sheet-title">
            {rendered.pair} пара · {rendered.start}–{rendered.end}
          </h2>
          <p className="sheet-sub">
            {dayLabel(dayISO)} · {lessonCountLabel(rendered.entries.length)}
          </p>
        </div>
        <button className="sheet-close" type="button" aria-label="Закрыть детали" onClick={onClose}>
          <X size={22} strokeWidth={1.6} />
        </button>
      </header>
      <div className="sheet-scroll">
        <div className="sheet-list">
          {rendered.entries.map((entry) => {
            const change = entryChange(entry, changesByLesson);
            return (
              <article className="sheet-lesson" key={`${entry.id}-${entry.subject}`}>
                <div className="sheet-lesson-top">
                  <h3>{entry.subject}</h3>
                  {entry.changed ? <span className="change-flag">замена</span> : null}
                </div>
                <p className="sheet-kind">
                  {entry.kind}
                  {subgroupLabel(entry) ? ` · ${subgroupLabel(entry)}` : ''}
                </p>
                <dl className="sheet-facts">
                  {entry.variants.length === 1 ? (
                    <>
                      <div>
                        <dt>Преподаватель</dt>
                        <dd>{entry.teacher || '—'}</dd>
                      </div>
                      <div>
                        <dt>Аудитория</dt>
                        <dd>
                          {entry.room}
                          {entry.building ? ` · корпус ${entry.building}` : ''}
                        </dd>
                      </div>
                    </>
                  ) : null}
                  <div>
                    <dt>Группа</dt>
                    <dd>{groupName}</dd>
                  </div>
                  {subgroupLabel(entry) ? (
                    <div>
                      <dt>Подгруппа</dt>
                      <dd>{subgroupLabel(entry)}</dd>
                    </div>
                  ) : null}
                </dl>
                {entry.variants.length > 1 ? (
                  <div className="sheet-variants">
                    <p className="sheet-variants-label">
                      По выбору · {variantCountLabel(entry.variants.length)}
                    </p>
                    <ul>
                      {entry.variants.map((variant) => (
                        <li key={`${variant.teacher}-${variant.room}`}>
                          <span>{variant.teacher || '—'}</span>
                          <span className="sheet-variant-room">
                            {variant.room}
                            {variant.building ? ` · корпус ${variant.building}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {change?.changes?.length ? (
                  <p className="sheet-change">
                    {change.changes[0].label}: <del>{change.changes[0].old}</del>{' '}
                    <span aria-hidden="true">→</span> <ins>{change.changes[0].new}</ins>
                  </p>
                ) : null}
                <div className="sheet-actions">
                  {entry.variants.length === 1 && entry.teacher
                    ? (() => {
                        const href = entry.lesson.teacher_id
                          ? `/tutor/${entry.lesson.teacher_id}`
                          : `/search?q=${encodeURIComponent(entry.teacher)}`;
                        return (
                          <AppLink to={href} onClick={openLink(href)}>
                            Расписание преподавателя
                          </AppLink>
                        );
                      })()
                    : null}
                  {entry.variants.length === 1 && entry.room
                    ? (() => {
                        const href = entry.lesson.auditory_id
                          ? `/auditory/${entry.lesson.auditory_id}`
                          : `/search?q=${encodeURIComponent(entry.room)}`;
                        return (
                          <AppLink to={href} onClick={openLink(href)}>
                            Аудитория {entry.room}
                          </AppLink>
                        );
                      })()
                    : null}
                </div>
              </article>
            );
          })}
        </div>
        <p className="sheet-foot">Данные из кэша · обновлено недавно</p>
      </div>
    </dialog>
  );
}
