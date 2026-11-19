import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { TodayPage } from './TodayPage';
import { renderRoute, resetPreferences } from '../test/utils';
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

async function renderToday(route = '/g/12246/today?day=2026-11-19&now=09:00') {
  renderRoute(<TodayPage groupId={12246} />, { route });
  return screen.findByRole('heading', { level: 1 });
}

describe('TodayPage', () => {
  beforeEach(() => {
    resetPreferences();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T08:00:00'));
    api.fetchGroups.mockResolvedValue(groups);
    api.fetchWeek.mockResolvedValue(sampleWeek());
    api.fetchChanges.mockResolvedValue({ items: [], next_before_id: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the current lesson, remaining time and the rest of the day', async () => {
    const heading = await renderToday();
    expect(heading).toHaveTextContent('Математический анализ');
    expect(screen.getByText('сейчас')).toBeInTheDocument();
    expect(screen.getByText('1 пара · 08:45–10:20')).toBeInTheDocument();
    expect(screen.getByText('до конца 80 мин')).toBeInTheDocument();
    expect(screen.getByText('Дальше сегодня')).toBeInTheDocument();
    expect(screen.getByText(/окно · 1 ч 35 мин/)).toBeInTheDocument();
    expect(document.querySelectorAll('.lesson-btn')).toHaveLength(1);
  });

  it('marks a lesson changed when it is in the change feed', async () => {
    api.fetchChanges.mockResolvedValue({
      items: [
        {
          id: 1,
          entity_type: 'group',
          entity_id: 12246,
          change_type: 'modified',
          lesson_id: 402,
          day: '2026-11-19',
          pair: 3,
          subject: 'Программирование',
          changes: [],
          created_at: '2026-11-19T06:00:00Z',
        },
      ],
      next_before_id: 0,
    });
    await renderToday();
    await waitFor(() => expect(screen.getByText('замена')).toBeInTheDocument());
  });

  it('opens the detail sheet from the now band', async () => {
    await renderToday();
    fireEvent.click(screen.getByRole('button', { name: /Детали/ }));
    expect(await screen.findByRole('dialog')).toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: '1 пара · 08:45–10:20' })).toBeInTheDocument();
    expect(screen.getByText('Четверг, 19 ноября · 1 занятие')).toBeInTheDocument();
  });

  it('switches days through the day strip', async () => {
    await renderToday();
    fireEvent.click(screen.getByRole('button', { name: /18/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('day=2026-11-18');
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Среда');
    expect(screen.getByText('первая пара в 08:45')).toBeInTheDocument();
    expect(screen.getByText('до 16:05')).toBeInTheDocument();
  });

  it('shows a day summary when no current or next lesson is left', async () => {
    vi.setSystemTime(new Date('2026-11-19T22:00:00'));
    const heading = await renderToday('/g/12246/today?day=2026-11-19');
    expect(heading).toHaveTextContent('Четверг');
    expect(screen.getByText(/2 пары · 08:45–14:20/)).toBeInTheDocument();
    expect(screen.getByText('первая пара в 08:45')).toBeInTheDocument();
    expect(screen.getByText(/На этот день занятий нет/)).toBeInTheDocument();
  });

  it('renders a skeleton while loading', () => {
    api.fetchWeek.mockReturnValue(new Promise(() => {}));
    renderRoute(<TodayPage groupId={12246} />, { route: '/g/12246/today?day=2026-11-19&now=09:00' });
    expect(document.querySelector('.skeleton-list')).toBeInTheDocument();
  });

  it('shows an error state and retries the request', async () => {
    api.fetchWeek.mockRejectedValue(new Error('network'));
    renderRoute(<TodayPage groupId={12246} />, { route: '/g/12246/today?day=2026-11-19&now=09:00' });
    expect(await screen.findByText(/Не удалось загрузить расписание/, {}, { timeout: 4000 })).toBeInTheDocument();
    const callsBefore = api.fetchWeek.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
    await waitFor(() => expect(api.fetchWeek.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('explains an empty subgroup and resets it', async () => {
    resetPreferences();
    const { usePreferences } = await import('../store/preferences');
    usePreferences.setState({ subgroup: '9' });
    api.fetchWeek.mockResolvedValue([
      {
        day: '19.11.2026',
        date: '2026-11-19',
        lessons: [
          {
            id: 900,
            time: 1,
            faculty: 'ФМС',
            lesson: 'Английский язык',
            type_work: 'Прак',
            teacher: 'Орлова Н. С.',
            group: 'ЮСС-003-О-02',
            auditCorps: '11-204',
            subgroupName: 'ЮСС-003-О-02/2',
            subgroup_number: '2',
            publishDate: '2026-11-10',
          },
        ],
      },
    ]);
    await renderToday();
    expect(screen.getByText(/Для подгруппы 9 занятий нет/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Показать все' }));
    expect(usePreferences.getState().subgroup).toBe('');
  });
});
