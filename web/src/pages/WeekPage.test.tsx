import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { WeekPage } from './WeekPage';
import { renderRoute, resetPreferences } from '../test/utils';
import { usePreferences } from '../store/preferences';
import { sampleWeek } from '../test/fixtures';

const api = vi.hoisted(() => ({
  search: vi.fn(),
  fetchGroups: vi.fn(),
  fetchWeek: vi.fn(),
  fetchChanges: vi.fn(),
  fetchHealth: vi.fn(),
  fetchNotificationSettings: vi.fn(),
  fetchTutor: vi.fn(),
  fetchAuditory: vi.fn(),
  patchNotificationSettings: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('../api/client', () => ({
  ...api,
  API_BASE: '/api/v1',
  API_ORIGIN: '/api/v1',
  errorMessage: () => 'error',
}));

const groups = [{ id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 }];

describe('WeekPage', () => {
  beforeEach(() => {
    resetPreferences();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00'));
    api.fetchGroups.mockResolvedValue(groups);
    api.fetchChanges.mockResolvedValue({ items: [], next_before_id: 0 });
    api.fetchWeek.mockImplementation((_type: string, _id: number, weekStart: string) =>
      Promise.resolve(weekStart === '2026-11-16' ? sampleWeek() : []),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the mobile week list with a range and every day', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 390,
    });
    expect(await screen.findByText('16–21 ноября')).toBeInTheDocument();
    expect(document.querySelectorAll('.wday')).toHaveLength(6);
    expect(screen.getAllByText('Физика').length).toBeGreaterThan(0);
    expect(screen.getByText(/Неделя начинается с понедельника/)).toBeInTheDocument();
  });

  it('moves to the next week and refetches it', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 390,
    });
    await screen.findByText('16–21 ноября');
    fireEvent.click(screen.getByRole('button', { name: 'Следующая неделя' }));
    expect(screen.getByTestId('location')).toHaveTextContent('week_start=2026-11-23');
    await waitFor(() => expect(api.fetchWeek).toHaveBeenCalledWith('group', 472, '2026-11-23'));
  });

  it('shows an empty week when the API returns no days', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-23',
      width: 390,
    });
    expect(await screen.findByText('23–28 ноября')).toBeInTheDocument();
    expect(screen.getAllByText('занятий нет')).toHaveLength(6);
  });

  it('opens the sheet from a deep link and removes the slot parameter', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16&day=2026-11-18&slot=4',
      width: 390,
    });
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
    expect(dialog).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: '4 пара · 14:30–16:05' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('location')).not.toHaveTextContent('slot='));
  });

  it('opens the sheet when a lesson row is clicked', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16&day=2026-11-18',
      width: 390,
    });
    await screen.findByText('16–21 ноября');
    fireEvent.click(screen.getAllByRole('button', { name: /2 занятия/ })[0]);
    expect(await screen.findByRole('dialog')).toHaveAttribute('open');
  });

  it('renders the desktop grid, aside and pair count', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 1440,
    });
    await screen.findByText('16–21 ноября');
    expect(document.querySelectorAll('.wk-head')).toHaveLength(6);
    expect(document.querySelectorAll('.wk-time')).toHaveLength(8);
    expect(screen.getByText('Среда, 18 ноября')).toBeInTheDocument();
    expect(screen.getByText(/13 пар на неделе/)).toBeInTheDocument();
    expect(document.querySelector('.week-grid')).toBeInTheDocument();
  });

  it('filters the desktop grid by the selected subgroup', async () => {
    usePreferences.setState({ subgroup: '1' });
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 1440,
    });
    await screen.findByText('16–21 ноября');
    expect(screen.getByText(/подгруппа 1/)).toBeInTheDocument();
    expect(screen.getAllByText('Базы данных').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Иностранный язык')).toHaveLength(1);
  });

  it('opens a slot from the desktop aside', async () => {
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 1440,
    });
    await screen.findByText('16–21 ноября');
    fireEvent.click(document.querySelector('.aside-item') as HTMLElement);
    expect(await screen.findByRole('dialog')).toHaveAttribute('open');
  });

  it('shows a retry state when the week fails', async () => {
    api.fetchWeek.mockRejectedValue(new Error('boom'));
    renderRoute(<WeekPage groupId={472} />, {
      route: '/g/472/week?week_start=2026-11-16',
      width: 390,
    });
    expect(await screen.findByText(/Не удалось загрузить неделю/, {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
