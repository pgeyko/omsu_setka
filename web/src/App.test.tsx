import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import App, { queryClient } from './App';
import { renderRoute, resetPreferences } from './test/utils';
import { usePreferences } from './store/preferences';
import { sampleWeek } from './test/fixtures';

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

vi.mock('./api/client', () => ({
  ...api,
  API_BASE: '/api/v1',
  API_ORIGIN: '/api/v1',
  errorMessage: () => 'error',
}));

vi.mock('./lib/firebase', () => ({
  requestForToken: vi.fn().mockResolvedValue('token'),
  onForegroundMessage: vi.fn(),
}));

describe('App routing', () => {
  beforeEach(() => {
    resetPreferences();
    queryClient.clear();
    api.fetchGroups.mockResolvedValue([{ id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 }]);
    api.fetchWeek.mockResolvedValue(sampleWeek());
    api.fetchChanges.mockResolvedValue({ items: [], next_before_id: 0 });
    api.search.mockResolvedValue({ groups: [], tutors: [], auditories: [] });
    api.fetchTutor.mockResolvedValue({ id: 15, name: 'Иванов Иван Иванович' });
    api.fetchAuditory.mockResolvedValue({ id: 3310, name: '4-308', building: '4' });
    api.fetchHealth.mockResolvedValue({
      status: 'ok',
      uptime: '1h',
      upstream: { healthy: true, consecutive_failures: 0, total_failures: 0 },
      last_sync: { dictionaries: '', schedules: '' },
      cache: { hits: 0, misses: 0, item_count: 0 },
    });
  });

  it('redirects the root to search when no group is saved', async () => {
    renderRoute(<App />, { route: '/' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/search'));
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('redirects the root to the saved group', async () => {
    usePreferences.setState({ group: { id: 472, name: 'ЮСС-003-О-02' } });
    renderRoute(<App />, { route: '/' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/472/today'));
  });

  it('redirects a short group link to today on mobile', async () => {
    renderRoute(<App />, { route: '/g/472', width: 390 });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/472/today'));
  });

  it('redirects a short group link to the week on desktop', async () => {
    renderRoute(<App />, { route: '/g/472', width: 1440 });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/472/week'));
  });

  it('redirects today to the week on desktop', async () => {
    usePreferences.setState({ group: { id: 472, name: 'ЮСС-003-О-02' } });
    renderRoute(<App />, { route: '/g/472/today', width: 1440 });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/g/472/week'));
  });

  it('redirects an invalid group id to search', async () => {
    renderRoute(<App />, { route: '/g/abc/today' });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/search'));
  });

  it('opens a tutor page without a saved group instead of redirecting', async () => {
    renderRoute(<App />, { route: '/tutor/15' });
    expect(await screen.findByText('Иванов Иван Иванович')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/tutor/15');
    expect(screen.queryByRole('navigation', { name: 'Основное меню' })).toBeNull();
  });

  it('opens an auditory page without a saved group', async () => {
    renderRoute(<App />, { route: '/auditory/3310', width: 1440 });
    await waitFor(() => expect(screen.getAllByText('4-308').length).toBeGreaterThan(0));
    expect(screen.getByTestId('location')).toHaveTextContent('/auditory/3310');
  });

  it('renders the not found page', () => {
    renderRoute(<App />, { route: '/nope' });
    expect(screen.getByRole('heading', { name: 'Страница не найдена' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute('href', '/');
  });

  it('applies and persists the dark theme from settings', async () => {
    usePreferences.setState({ group: { id: 472, name: 'ЮСС-003-О-02' } });
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
    renderRoute(<App />, { route: '/g/472/settings' });
    fireEvent.click(await screen.findByRole('button', { name: 'Тёмная' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    expect(meta.getAttribute('content')).toBe('#131814');
    expect(usePreferences.getState().theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Светлая' }));
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(meta.getAttribute('content')).toBe('#F7F8F3');
    meta.remove();
  });

  it('shows the offline bar when the network goes down', async () => {
    usePreferences.setState({ group: { id: 472, name: 'ЮСС-003-О-02' } });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    renderRoute(<App />, { route: '/g/472/week' });
    await screen.findByText('16–21 ноября');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByText(/Нет сети · данные от 2 минут назад/)).toBeInTheDocument();
  });
});
