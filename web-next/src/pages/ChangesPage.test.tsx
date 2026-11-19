import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ChangesPage } from './ChangesPage';
import { renderRoute, resetPreferences } from '../test/utils';
import { change } from '../test/fixtures';
import type { ScheduleChange } from '../api/types';

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

const own = change({
  id: 1,
  day: '2026-11-18',
  pair: 2,
  subject: 'Математический анализ',
  lesson_id: 302,
  changes: [{ field: 'teacher', label: 'преподаватель', old: 'Сидоров А. В.', new: 'Иванов И. И.' }],
});
const other = change({
  id: 2,
  entity_id: 468,
  day: '2026-11-17',
  pair: 3,
  subgroup: '2',
  subject: 'Иностранный язык',
  changes: [{ field: 'auditCorps', label: 'аудитория', old: '11-201', new: '11-204' }],
});
const removed = change({
  id: 3,
  change_type: 'removed',
  day: '2026-11-17',
  pair: 5,
  subject: 'История России',
  changes: [],
});
const tutorChange = change({
  id: 4,
  entity_type: 'tutor',
  entity_id: 15,
  day: '2026-11-16',
  pair: 2,
  subject: 'Физика',
  changes: [],
});

function mockPages(items: ScheduleChange[], next = 0) {
  api.fetchChanges.mockImplementation((params: { scope?: string; before_id?: number }) => {
    if (params.scope === 'all') return Promise.resolve({ items: [own, other, tutorChange], next_before_id: 0 });
    return Promise.resolve({ items, next_before_id: next });
  });
}

describe('ChangesPage', () => {
  beforeEach(() => {
    resetPreferences();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T12:00:00'));
    api.fetchGroups.mockResolvedValue([{ id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 }]);
    mockPages([own, removed]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders grouped changes, diffs and a pair link', async () => {
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    expect(screen.getByRole('heading', { name: 'Изменения' })).toBeInTheDocument();
    expect(await screen.findByText('Вчера, 18 ноября')).toBeInTheDocument();
    expect(screen.getAllByText('17 ноября').length).toBeGreaterThan(0);
    expect(screen.getByText('Математический анализ')).toBeInTheDocument();
    expect(screen.getByText(/Сидоров А. В./)).toBeInTheDocument();
    expect(screen.getByText(/Иванов И. И./)).toBeInTheDocument();
    expect(screen.getByText(/пара отменена/)).toBeInTheDocument();
    const ownArticle = screen.getByText('Математический анализ').closest('article')!;
    expect(within(ownArticle).getByRole('link', { name: 'Открыть пару' })).toHaveAttribute(
      'href',
      '/g/472/week?week_start=2026-11-16&day=2026-11-18&slot=2',
    );
  });

  it('requests only the own group without a subgroup filter by default', async () => {
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    await screen.findByText('Математический анализ');
    expect(api.fetchChanges).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: 'group', entity_id: 472, subgroup: undefined, limit: 20 }),
    );
  });

  it('switches to all groups without entity or subgroup filters', async () => {
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    await screen.findByText('Математический анализ');
    fireEvent.click(screen.getByRole('button', { name: 'Все группы' }));
    expect(await screen.findByText('Иностранный язык')).toBeInTheDocument();
    const lastCall = api.fetchChanges.mock.calls.at(-1)![0];
    expect(lastCall).toMatchObject({ scope: 'all' });
    expect(lastCall.entity_type).toBeUndefined();
    expect(lastCall.entity_id).toBeUndefined();
    expect(lastCall.subgroup).toBeUndefined();
  });

  it('links changes of other groups to their own schedule', async () => {
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    await screen.findByText('Математический анализ');
    fireEvent.click(screen.getByRole('button', { name: 'Все группы' }));
    const article = (await screen.findByText('Иностранный язык')).closest('article')!;
    expect(within(article).getByRole('link', { name: 'Открыть пару' })).toHaveAttribute(
      'href',
      '/g/468/week?week_start=2026-11-16&day=2026-11-17&slot=3',
    );
    expect(within(article).getByText(/2 подгруппы/)).toBeInTheDocument();
  });

  it('does not link tutor changes to a group schedule', async () => {
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    await screen.findByText('Математический анализ');
    fireEvent.click(screen.getByRole('button', { name: 'Все группы' }));
    const article = (await screen.findByText('Физика')).closest('article')!;
    expect(within(article).queryByRole('link', { name: 'Открыть пару' })).toBeNull();
  });

  it('loads the next page', async () => {
    api.fetchChanges.mockImplementation((params: { before_id?: number }) =>
      Promise.resolve(
        params.before_id
          ? { items: [change({ id: 9, day: '2026-11-16', subject: 'Вторая страница', changes: [] })], next_before_id: 0 }
          : { items: [own], next_before_id: 1 },
      ),
    );
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    const button = await screen.findByRole('button', { name: 'Показать ещё' });
    fireEvent.click(button);
    expect(await screen.findByText('Вторая страница')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).toBeNull();
  });

  it('shows an empty state', async () => {
    mockPages([]);
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    expect(await screen.findByText(/Изменений нет/)).toBeInTheDocument();
  });

  it('shows an error state', async () => {
    api.fetchChanges.mockRejectedValue(new Error('boom'));
    renderRoute(<ChangesPage groupId={472} />, { route: '/g/472/changes', width: 390 });
    await waitFor(() => expect(screen.getByText(/Не удалось загрузить изменения/)).toBeInTheDocument(), {
      timeout: 4000,
    });
  });
});
