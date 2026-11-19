import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailSheet } from './DetailSheet';
import { slotsOf, type Slot } from '../lib/schedule';
import { change, lesson, sampleWeek } from '../test/fixtures';

const schedule = new Map(sampleWeek().map((day) => [day.date!, day]));

function slot(date: string, pair: number): Slot {
  const found = slotsOf(schedule.get(date)!, '', new Set()).find((item) => item.pair === pair);
  if (!found) throw new Error(`no slot ${pair} at ${date}`);
  return found;
}

function renderSheet(props: Partial<React.ComponentProps<typeof DetailSheet>> = {}) {
  return render(
    <MemoryRouter>
      <DetailSheet
        open
        dayISO="2026-11-18"
        slot={slot('2026-11-18', 4)}
        groupName="ЮСС-003-О-02"
        changesByLesson={new Map()}
        onClose={() => {}}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailSheet', () => {
  it('renders lesson facts and both actions', () => {
    renderSheet();
    expect(screen.getByRole('heading', { name: '4 пара · 14:30–16:05' })).toBeInTheDocument();
    expect(screen.getByText('Среда, 18 ноября · 2 занятия')).toBeInTheDocument();
    expect(screen.getByText('Базы данных')).toBeInTheDocument();
    expect(screen.getByText('Иностранный язык')).toBeInTheDocument();
    expect(screen.getByText('Кузнецов Д. С.')).toBeInTheDocument();
    expect(screen.getByText('4-308 · корпус 4')).toBeInTheDocument();
    const teacherLinks = screen.getAllByRole('link', { name: 'Расписание преподавателя' });
    expect(teacherLinks).toHaveLength(2);
    expect(teacherLinks[0]).toHaveAttribute(
      'href',
      '/search?q=%D0%9A%D1%83%D0%B7%D0%BD%D0%B5%D1%86%D0%BE%D0%B2%20%D0%94.%20%D0%A1.',
    );
    expect(screen.getByRole('link', { name: /Аудитория 4-308/ })).toHaveAttribute(
      'href',
      '/search?q=4-308',
    );
  });

  it('marks a lesson as changed and shows the diff', () => {
    const changed = change({ lesson_id: 303, subject: 'Базы данных' });
    const changedSlot = slotsOf(schedule.get('2026-11-18')!, '', new Set([303])).find(
      (item) => item.pair === 4,
    )!;
    renderSheet({ slot: changedSlot, changesByLesson: new Map([[303, changed]]) });
    expect(screen.getByText('замена')).toBeInTheDocument();
    expect(screen.getByText(/Сидоров А. В./)).toBeInTheDocument();
    expect(screen.getByText(/Иванов И. И./)).toBeInTheDocument();
  });

  it('closes from the header button', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть детали' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes when a link is used', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole('link', { name: /Аудитория 4-308/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders a single lesson with subgroup info', () => {
    const subgroupSlot = slotsOf(
      { day: '18.11.2026', date: '2026-11-18', lessons: [lesson({ id: 1, time: 2, subgroup_number: '1' })] },
      '',
      new Set(),
    )[0];
    renderSheet({ slot: subgroupSlot });
    expect(screen.getAllByText(/1 подгруппа/).length).toBeGreaterThan(1);
  });

  it('renders nothing without a slot', () => {
    const { container } = renderSheet({ slot: null });
    expect(container.querySelector('dialog')).toBeNull();
  });
});
