import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { SettingsPage } from './SettingsPage';
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

const firebase = vi.hoisted(() => ({
  requestForToken: vi.fn(),
  onForegroundMessage: vi.fn(),
}));

vi.mock('../api/client', () => ({
  ...api,
  API_BASE: '/api/v1',
  API_ORIGIN: '/api/v1',
  errorMessage: () => 'error',
}));

vi.mock('../lib/firebase', () => firebase);

const subscription = {
  fcm_token: 'demo-token',
  entity_type: 'group' as const,
  entity_id: 472,
  notify_on_change: true,
  notify_daily_digest: true,
  digest_time: '19:00',
  notify_before_lesson: false,
  before_minutes: 30,
  timezone: 'Asia/Omsk',
  subgroup: '',
};

async function renderSettings(route = '/g/472/settings') {
  renderRoute(<SettingsPage groupId={472} />, { route, width: 390 });
  return screen.findByDisplayValue('19:00');
}

describe('SettingsPage', () => {
  beforeEach(() => {
    resetPreferences();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T12:00:00'));
    localStorage.setItem('setka-fcm-token', 'demo-token');
    api.fetchGroups.mockResolvedValue([{ id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 }]);
    api.fetchWeek.mockResolvedValue(sampleWeek());
    api.fetchChanges.mockResolvedValue({ items: [], next_before_id: 0 });
    api.fetchHealth.mockResolvedValue({
      status: 'ok',
      uptime: '1h',
      upstream: { healthy: true, consecutive_failures: 0, total_failures: 0 },
      last_sync: { dictionaries: '', schedules: '' },
      cache: { hits: 1, misses: 0, item_count: 1 },
    });
    api.fetchNotificationSettings.mockResolvedValue(subscription);
    api.patchNotificationSettings.mockResolvedValue(undefined);
    api.unsubscribe.mockResolvedValue(undefined);
    firebase.requestForToken.mockResolvedValue('demo-token');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads notification settings and subgroup options', async () => {
    await renderSettings();
    expect(await screen.findByText(/Тема, подгруппа и уведомления/)).toBeInTheDocument();
    expect(screen.getByLabelText('Часовой пояс')).toHaveValue('Asia/Omsk');
    const subgroup = screen.getByLabelText('Моя подгруппа') as HTMLSelectElement;
    expect(Array.from(subgroup.options).map((option) => option.value)).toEqual(['', '1', '2']);
    expect(screen.queryByText(/Разрешение на уведомления не выдано/)).toBeNull();
  });

  it('migrates the legacy per-entity FCM token', async () => {
    localStorage.removeItem('setka-fcm-token');
    localStorage.setItem('fcm_token_group_472', 'legacy-token');
    renderRoute(<SettingsPage groupId={472} />, { route: '/g/472/settings', width: 390 });
    await waitFor(() =>
      expect(api.fetchNotificationSettings).toHaveBeenCalledWith('legacy-token', 'group', 472),
    );
    expect(localStorage.getItem('setka-fcm-token')).toBe('legacy-token');
  });

  it('switches the theme and persists it', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Тёмная' }));
    expect(usePreferences.getState().theme).toBe('dark');
    expect(localStorage.getItem('setka-theme')).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'Светлая' }));
    expect(usePreferences.getState().theme).toBe('light');
  });

  it('persists toggles through the PATCH endpoint', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Изменения в расписании' }));
    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith(
        'demo-token',
        'group',
        472,
        expect.objectContaining({ notify_on_change: false }),
      ),
    );
    expect(await screen.findByText('Сохранено')).toBeInTheDocument();
  });

  it('validates the digest time before saving', async () => {
    await renderSettings();
    const input = screen.getByLabelText('Время дайджеста');
    fireEvent.change(input, { target: { value: '99:99' } });
    fireEvent.blur(input);
    expect(await screen.findByText('Время дайджеста — в формате ЧЧ:ММ')).toBeInTheDocument();
    expect(input).toHaveValue('19:00');
    expect(api.patchNotificationSettings).not.toHaveBeenCalled();
  });

  it('saves a valid digest time on blur', async () => {
    await renderSettings();
    const input = screen.getByLabelText('Время дайджеста');
    fireEvent.change(input, { target: { value: '20:15' } });
    fireEvent.blur(input);
    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith(
        'demo-token',
        'group',
        472,
        expect.objectContaining({ digest_time: '20:15' }),
      ),
    );
  });

  it('saves the subgroup together with notifications', async () => {
    await renderSettings();
    await screen.findByRole('option', { name: '2' });
    const subgroup = screen.getByLabelText('Моя подгруппа');
    fireEvent.change(subgroup, { target: { value: '2' } });
    expect(usePreferences.getState().subgroup).toBe('2');
    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith(
        'demo-token',
        'group',
        472,
        expect.objectContaining({ subgroup: '2' }),
      ),
    );
  });

  it('requires two clicks to unsubscribe', async () => {
    await renderSettings();
    const button = screen.getByRole('button', { name: 'Отписаться от группы' });
    fireEvent.click(button);
    expect(api.unsubscribe).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Нажмите ещё раз/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Нажмите ещё раз/ }));
    await waitFor(() => expect(api.unsubscribe).toHaveBeenCalledWith('demo-token', 'group', 472));
    expect(await screen.findByRole('button', { name: 'Вы отписаны от группы' })).toBeDisabled();
    expect(screen.getByText('Вы отписаны от группы.')).toBeInTheDocument();
  });

  it('explains that notifications are off when there is no token', async () => {
    localStorage.removeItem('setka-fcm-token');
    renderRoute(<SettingsPage groupId={472} />, { route: '/g/472/settings', width: 390 });
    expect(await screen.findByText(/Разрешение на уведомления не выдано/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Отписаться от группы/ }));
    expect(await screen.findByText('Уведомления не включены для этой группы.')).toBeInTheDocument();
    expect(api.unsubscribe).not.toHaveBeenCalled();
  });

  it('shows the offline server state', async () => {
    api.fetchHealth.mockResolvedValue({
      status: 'degraded',
      uptime: '1h',
      upstream: { healthy: false, consecutive_failures: 3, total_failures: 3 },
      last_sync: { dictionaries: '', schedules: '' },
      cache: { hits: 0, misses: 1, item_count: 0 },
    });
    await renderSettings();
    expect(await screen.findByText(/Сервер недоступен/)).toBeInTheDocument();
  });
});
