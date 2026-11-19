import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { ScheduleChange } from '../api/types';
import type { Slot, SlotEntry } from '../lib/schedule';
import { dayLabel, lessonCountLabel, subgroupLabel } from '../lib/schedule';

interface DetailSheetProps {
  open: boolean;
  dayISO: string;
  slot: Slot | null;
  groupName: string;
  changesByLesson: Map<number, ScheduleChange>;
  onClose: () => void;
}

function entryChange(entry: SlotEntry, changes: Map<number, ScheduleChange>) {
  return changes.get(entry.lesson.id);
}

export function DetailSheet({ open, dayISO, slot, groupName, changesByLesson, onClose }: DetailSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!slot) return null;

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <header className="sheet-head">
        <div className="sheet-head-text">
          <h2 className="sheet-title" id="sheet-title">
            {slot.pair} пара · {slot.start}–{slot.end}
          </h2>
          <p className="sheet-sub">
            {dayLabel(dayISO)} · {lessonCountLabel(slot.entries.length)}
          </p>
        </div>
        <button className="sheet-close" type="button" aria-label="Закрыть детали" onClick={onClose}>
          <X size={22} strokeWidth={1.6} />
        </button>
      </header>
      <div className="sheet-scroll">
        <div className="sheet-list">
          {slot.entries.map((entry) => {
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
                {change?.changes?.length ? (
                  <p className="sheet-change">
                    {change.changes[0].label}: <del>{change.changes[0].old}</del>{' '}
                    <span aria-hidden="true">→</span> <ins>{change.changes[0].new}</ins>
                  </p>
                ) : null}
                <div className="sheet-actions">
                  {entry.teacher ? (
                    <Link to={`/search?q=${encodeURIComponent(entry.teacher)}`} data-close-sheet onClick={onClose}>
                      Расписание преподавателя
                    </Link>
                  ) : null}
                  {entry.room ? (
                    <Link to={`/search?q=${encodeURIComponent(entry.room)}`} data-close-sheet onClick={onClose}>
                      Аудитория {entry.room}
                    </Link>
                  ) : null}
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
