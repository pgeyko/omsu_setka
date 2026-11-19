import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DayStrip, NowBand, SlotRow, WeekGrid, WeekList } from './Schedule';
import type { Day } from '../api/types';
import type { Slot } from '../lib/schedule';
import { slotsOf } from '../lib/schedule';
import { lesson, sampleWeek } from '../test/fixtures';

const schedule = new Map<string, Day>(sampleWeek().map((day) => [day.date!, day]));
const noChanges = new Set<number>();

function slotAt(date: string, pair: number, subgroup = ''): Slot {
  const slot = slotsOf(schedule.get(date)!, subgroup, noChanges).find((item) => item.pair === pair);
  if (!slot) throw new Error(`no slot ${pair} at ${date}`);
  return slot;
}

describe('DayStrip', () => {
  it('renders every day and marks the selected one', () => {
    const days = ['2026-11-16', '2026-11-17'];
    render(<DayStrip days={days} selected="2026-11-17" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveTextContent('17');
  });

  it('calls onSelect with the day', () => {
    const onSelect = vi.fn();
    render(<DayStrip days={['2026-11-16', '2026-11-17']} selected="2026-11-16" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /17/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-17');
  });
});

describe('NowBand', () => {
  it('shows the current lesson with remaining minutes and progress', () => {
    const slot = slotAt('2026-11-16', 1);
    const { container } = render(<NowBand slot={slot} mode="now" progress={42} remaining={55} onOpen={() => {}} />);
    expect(screen.getByText('сейчас')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Физика');
    expect(screen.getByText(/ауд\./)).toHaveTextContent('1-102');
    expect(screen.getByText('до конца 55 мин')).toBeInTheDocument();
    expect(container.querySelector('.now-progress i')).toHaveStyle({ width: '42%' });
  });

  it('shows the next lesson without the progress bar', () => {
    const slot = slotAt('2026-11-16', 1);
    const { container } = render(<NowBand slot={slot} mode="next" onOpen={() => {}} />);
    expect(screen.getByText('далее')).toBeInTheDocument();
    expect(screen.getByText(/начнётся в 08:45/)).toBeInTheDocument();
    expect(container.querySelector('.now-progress')).toBeNull();
  });

  it('opens details', () => {
    const onOpen = vi.fn();
    render(<NowBand slot={slotAt('2026-11-16', 1)} mode="now" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: /Детали/ }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('renders a merged slot as a lesson count', () => {
    const slot = slotAt('2026-11-18', 4);
    render(<NowBand slot={slot} mode="now" onOpen={() => {}} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2 занятия');
  });
});

describe('SlotRow', () => {
  it('renders a lesson and opens it', () => {
    const onOpen = vi.fn();
    render(
      <ul>
        <SlotRow slot={slotAt('2026-11-16', 1)} onOpen={onOpen} />
      </ul>,
    );
    expect(screen.getByText('Физика')).toBeInTheDocument();
    expect(screen.getByText(/лекция/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('renders a window without a button', () => {
    const windowSlot: Slot = { pair: 2, start: '10:30', end: '12:05', entries: [], window: true };
    render(
      <ul>
        <SlotRow slot={windowSlot} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText(/окно · 1 ч 35 мин/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows a change flag for changed lessons', () => {
    const slot = slotsOf(
      { day: '18.11.2026', date: '2026-11-18', lessons: [lesson({ id: 7, time: 1 })] },
      '',
      new Set([7]),
    )[0];
    render(
      <ul>
        <SlotRow slot={slot} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText('замена')).toBeInTheDocument();
  });

  it('renders parallel options as a choice instead of a lesson count', () => {
    const elective = slotsOf(
      {
        day: '18.11.2026',
        date: '2026-11-18',
        lessons: [
          lesson({ id: 1, time: 1, lesson: 'Физкультура', type_work: 'Прак', teacher: 'Иванов И. И.' }),
          lesson({ id: 2, time: 1, lesson: 'Физкультура', type_work: 'Прак', teacher: 'Петров П. П.', auditCorps: '6-115' }),
        ],
      },
      '',
      noChanges,
    )[0];
    render(
      <ul>
        <SlotRow slot={elective} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText('Физкультура')).toBeInTheDocument();
    expect(screen.getByText('практика')).toBeInTheDocument();
    expect(screen.queryByText('Иванов И. И.')).toBeNull();
    expect(screen.queryByText('Петров П. П.')).toBeNull();
  });

  it('shows subgroup chips and merged entries', () => {
    const merged = slotAt('2026-11-18', 4);
    render(
      <ul>
        <SlotRow slot={merged} onOpen={() => {}} />
      </ul>,
    );
    expect(screen.getByText('2 занятия')).toBeInTheDocument();
    expect(screen.getByText(/Базы данных/)).toBeInTheDocument();
    expect(screen.getByText(/Иностранный язык/)).toBeInTheDocument();
  });
});

describe('WeekList', () => {
  it('renders six days with subjects and empty states', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
    render(
      <WeekList
        days={days}
        schedule={schedule}
        subgroup="1"
        changedIds={new Set([303])}
        onOpen={() => {}}
      />,
    );
    expect(document.querySelectorAll('.wday')).toHaveLength(6);
    expect(screen.getAllByText('Физика').length).toBeGreaterThan(0);
    expect(screen.getAllByText('замена').length).toBeGreaterThan(0);
  });

  it('renders an empty day with a reset action for a subgroup', () => {
    const onClearSubgroup = vi.fn();
    render(
      <WeekList
        days={['2026-11-22']}
        schedule={new Map()}
        subgroup="2"
        changedIds={noChanges}
        onOpen={() => {}}
        onClearSubgroup={onClearSubgroup}
      />,
    );
    expect(screen.getByText(/нет занятий для подгруппы 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(onClearSubgroup).toHaveBeenCalled();
  });
});

describe('WeekGrid', () => {
  it('renders eight pair rows, six day heads and clickable lessons', () => {
    const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
    const onOpen = vi.fn();
    render(
      <WeekGrid
        days={days}
        schedule={schedule}
        subgroup=""
        changedIds={noChanges}
        onOpen={onOpen}
      />,
    );
    expect(document.querySelectorAll('.wk-head')).toHaveLength(6);
    expect(document.querySelectorAll('.wk-time')).toHaveLength(8);
    const first = screen.getAllByRole('button')[0];
    fireEvent.click(first);
    expect(onOpen).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ entries: expect.any(Array) }));
  });

  it('marks changed lessons with the desktop change badge', () => {
    const changed = slotsOf(
      schedule.get('2026-11-18')!,
      '',
      new Set([302]),
    ).find((item) => item.pair === 2)!;
    render(
      <WeekGrid
        days={['2026-11-18']}
        schedule={new Map([['2026-11-18', schedule.get('2026-11-18')!]])}
        subgroup=""
        changedIds={new Set([302])}
        onOpen={() => {}}
      />,
    );
    expect(changed.entries[0].changed).toBe(true);
    expect(screen.getByText('замена')).toHaveClass('f');
  });

  it('marks windows between lessons', () => {
    render(
      <WeekGrid
        days={['2026-11-16']}
        schedule={schedule}
        subgroup=""
        changedIds={noChanges}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByText('окно')).toBeInTheDocument();
  });
});
