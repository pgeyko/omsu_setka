import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SearchPage } from './SearchPage';
import { resetPreferences, renderRoute } from '../test/utils';
import { usePreferences } from '../store/preferences';

const api = vi.hoisted(() => ({
  search: vi.fn(),
  fetchGroups: vi.fn(),
  fetchWeek: vi.fn(),
  fetchChanges: vi.fn(),
  fetchHealth: vi.fn(),
  fetchNotificationSettings: vi.fn(),
  fetchTutor: vi.fn(),
  fetchAuditory: vi.fn(),
  fetchTutors: vi.fn(),
  fetchAuditories: vi.fn(),
  fetchLegacyChanges: vi.fn(),
  fetchScheduleDay: vi.fn(),
  fetchSubscriptions: vi.fn(),
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

const groups = [
  { id: 472, name: 'ЮСС-003-О-02', type: 'group' as const, real_group_id: 12246 },
  { id: 468, name: 'ЮСС-002-О-01', type: 'group' as const, real_group_id: 12190 },
];
const tutors = [{ id: 15, name: 'Иванов Иван Иванович', type: 'tutor' as const }];
const auditories = [{ id: 3310, name: '4-308', type: 'auditory' as const, building: '4' }];

function mockResults() {
  api.search.mockResolvedValue({ groups, tutors, auditories });
}

describe('SearchPage', () => {
  beforeEach(() => {
    resetPreferences();
    mockResults();
    api.fetchGroups.mockResolvedValue(groups);
    api.fetchChanges.mockResolvedValue({ items: [], next_before_id: 0 });
  });

  it('shows recent entities for an empty query', () => {
    usePreferences.setState({
      recentEntities: [
        { type: 'group', id: 12246, name: 'ЮСС-003-О-02' },
        { type: 'tutor', id: 15, name: 'Иванов Иван Иванович' },
      ],
    });
    renderRoute(<SearchPage />, { route: '/search' });
    expect(screen.getByText('Недавние запросы')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ЮСС-003-О-02/ })).toHaveAttribute('href', '/g/12246/today');
    expect(screen.getByRole('link', { name: /Иванов Иван Иванович/ })).toHaveAttribute('href', '/tutor/15');
    expect(screen.getByText(/Если нужной группы нет/)).toBeInTheDocument();
    expect(api.search).not.toHaveBeenCalled();
  });

  it('shows placeholder recents when nothing was opened yet', () => {
    renderRoute(<SearchPage />, { route: '/search' });
    expect(screen.getByText('Пока пусто')).toBeInTheDocument();
  });

  it('does not search for a single character', async () => {
    renderRoute(<SearchPage />, { route: '/search' });
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'ю' } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(api.search).not.toHaveBeenCalled();
  });

  it('debounces input and groups results by type', async () => {
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'юсс' } });
    await waitFor(() => expect(api.search).toHaveBeenCalledWith('юсс', 'all'));
    expect(await screen.findByText('ЮСС-003-О-02')).toBeInTheDocument();
    expect(screen.getByText('ЮСС-002-О-01')).toBeInTheDocument();
    expect(screen.getByText('Преподаватели')).toBeInTheDocument();
    expect(screen.getByText('Аудитории')).toBeInTheDocument();
    expect(screen.getByText('4 результата')).toBeInTheDocument();
  });

  it('opens a group, saves it and navigates to today', async () => {
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'юсс' } });
    const link = await screen.findByRole('link', { name: /ЮСС-003-О-02/ });
    fireEvent.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent('/g/12246/today');
    expect(usePreferences.getState().group).toEqual({ id: 12246, name: 'ЮСС-003-О-02' });
    expect(usePreferences.getState().favorites).toHaveLength(1);
    expect(usePreferences.getState().recentEntities[0]).toEqual({
      type: 'group',
      id: 12246,
      name: 'ЮСС-003-О-02',
    });
  });

  it('opens a tutor and remembers it', async () => {
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'иван' } });
    const link = await screen.findByRole('link', { name: /Иванов Иван Иванович/ });
    fireEvent.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent('/tutor/15');
    expect(usePreferences.getState().recentEntities[0]).toEqual({
      type: 'tutor',
      id: 15,
      name: 'Иванов Иван Иванович',
    });
  });

  it('supports a flat array response and falls back to the section type for links', async () => {
    api.search.mockResolvedValue([{ id: 15, name: 'Иванов Иван Иванович', type: 'tutor' }]);
    renderRoute(<SearchPage />, { route: '/search?q=иван' });
    const link = await screen.findByRole('link', { name: /Иванов/ });
    fireEvent.click(link);
    expect(screen.getByTestId('location')).toHaveTextContent('/tutor/15');
  });

  it('shows an error when search fails', async () => {
    api.search.mockRejectedValue(new Error('boom'));
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'юсс' } });
    expect(await screen.findByText(/Поиск временно недоступен/)).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    api.search.mockResolvedValue({ groups: [], tutors: [], auditories: [] });
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(await screen.findByText(/Ничего не нашлось/)).toBeInTheDocument();
  });

  it('disables group rows without a real_group_id', async () => {
    api.search.mockResolvedValue({
      groups: [{ id: 1, name: 'Старая группа', type: 'group', real_group_id: null }],
      tutors: [],
      auditories: [],
    });
    renderRoute(<SearchPage />, { route: '/search' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'стар' } });
    expect(await screen.findByText('нет ID для расписания')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Старая группа/ })).toBeNull();
  });
});
