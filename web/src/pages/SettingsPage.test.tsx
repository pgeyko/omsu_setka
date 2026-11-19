import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  fetchGroupSubgroups: vi.fn(),
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
  digest_time: '18:30',
  notify_before_lesson: false,
  before_minutes: 30,
  timezone: 'Asia/Omsk',
  subgroup: '',
};

async function renderSettings(route = '/g/472/settings', withToken = true) {
  if (!withToken) localStorage.removeItem('setka-fcm-token');
  renderRoute(<SettingsPage groupId={472} />, { route, width: 390 });
  const hour = screen.getByLabelText('Час дайджеста');
  await waitFor(() => expect(hour).toHaveValue(withToken ? '18' : '19'));
  return hour;
}

describe('SettingsPage', () => {
  beforeEach(() => {
    resetPreferences();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-19T12:00:00'));
    localStorage.setItem('setka-fcm-token', 'demo-token');
    api.fetchGroups.mockResolvedValue([{ id: 472, name: 'ЮСС-003-О-02', real_group_id: 12246 }]);
    api.fetchGroupSubgroups.mockResolvedValue(['1', '2']);
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
    expect(screen.getByLabelText('Час дайджеста')).toHaveValue('18');
    expect(screen.getByLabelText('Минуты дайджеста')).toHaveValue('30');
    const subgroup = screen.getByRole('group', { name: 'Моя подгруппа' });
    expect(within(subgroup).getByRole('button', { name: 'Все подгруппы' })).toBeInTheDocument();
    expect(within(subgroup).getByRole('button', { name: '1-я подгруппа' })).toBeInTheDocument();
    expect(within(subgroup).getByRole('button', { name: '2-я подгруппа' })).toBeInTheDocument();
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

  it('saves the digest time selected with the hour and minute pickers', async () => {
    await renderSettings();
    fireEvent.change(screen.getByLabelText('Час дайджеста'), { target: { value: '20' } });
    await waitFor(() => expect(screen.getByLabelText('Час дайджеста')).toHaveValue('20'));
    fireEvent.change(screen.getByLabelText('Минуты дайджеста'), { target: { value: '15' } });
    await waitFor(() =>
      expect(api.patchNotificationSettings).toHaveBeenCalledWith(
        'demo-token',
        'group',
        472,
        expect.objectContaining({ digest_time: '20:15' }),
      ),
    );
    expect(screen.getByLabelText('Час дайджеста')).toHaveValue('20');
    expect(screen.getByLabelText('Минуты дайджеста')).toHaveValue('15');
  });

  it('saves the subgroup together with notifications', async () => {
    await renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: '2-я подгруппа' }));
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

  it('offers a permission sheet after enabling notifications without a token', async () => {
    await renderSettings(undefined, false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Напоминание перед парой' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByText(/Уведомления для ЮСС-003-О-02/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Позже' }));
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
    expect(localStorage.getItem('setka-push-dismissed-472')).toBeTruthy();
  });

  it('requests browser permission from the sheet and subscribes', async () => {
    firebase.requestForToken.mockResolvedValue('sheet-token');
    await renderSettings(undefined, false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Напоминание перед парой' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Разрешить' }));
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledWith('sheet-token', 'group', 472, '', expect.any(Object)));
    expect(localStorage.getItem('setka-fcm-token')).toBe('sheet-token');
    await waitFor(() => expect(dialog).not.toHaveAttribute('open'));
  });

  it('shows a loader while the push subscription is being created', async () => {
    let resolveToken: (value: string | null) => void = () => {};
    firebase.requestForToken.mockImplementation(
      () => new Promise<string | null>((resolve) => { resolveToken = resolve; }),
    );
    await renderSettings(undefined, false);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Напоминание перед парой' }));
    const dialog = await screen.findByRole('dialog', {}, { timeout: 3000 });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Разрешить' }));
    expect(within(dialog).getByRole('status')).toHaveTextContent(/Подключаем уведомления/);
    expect(within(dialog).getByRole('button', { name: /Подключаем/ })).toBeDisabled();
    await waitFor(() => expect(firebase.requestForToken).toHaveBeenCalled());
    await act(async () => {
      resolveToken('loader-token');
    });
    await waitFor(() => expect(api.subscribe).toHaveBeenCalledWith('loader-token', 'group', 472, '', expect.any(Object)));
  });

  it('shows a connect action when browser permission is granted but there is no token', async () => {
    const notification = window.Notification as unknown as { permission: string };
    const original = notification.permission;
    notification.permission = 'granted';
    try {
      await renderSettings(undefined, false);
      expect(screen.getByText(/Разрешение уже выдано/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Подключить уведомления' })).toBeInTheDocument();
    } finally {
      notification.permission = original;
    }
  });

  it('keeps local notification preferences after a remount', async () => {
    localStorage.removeItem('setka-fcm-token');
    const first = renderRoute(<SettingsPage groupId={472} />, { route: '/g/472/settings', width: 390 });
    const reminder = screen.getByRole('checkbox', { name: 'Напоминание перед парой' });
    fireEvent.click(reminder);
    await waitFor(() => expect(reminder).toBeChecked());
    first.unmount();

    renderRoute(<SettingsPage groupId={472} />, { route: '/g/472/settings', width: 390 });
    expect(await screen.findByRole('checkbox', { name: 'Напоминание перед парой' })).toBeChecked();
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
