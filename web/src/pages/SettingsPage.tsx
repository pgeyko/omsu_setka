import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLink } from '../components/AppLink';
import { X } from 'lucide-react';
import { useGroupName, useGroupSubgroups, useHealth, useNotificationSettings, useWeekSchedule } from '../api/queries';
import { patchNotificationSettings, subscribe, unsubscribe } from '../api/client';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import { requestForToken } from '../lib/firebase';
import { usePageMeta } from '../lib/usePageMeta';
import { currentWeekStart } from '../lib/date';
import { normalizeSubgroup } from '../lib/schedule';

const THEMES: Array<{ value: 'light' | 'dark' | 'system'; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Системная' },
];

interface SettingsState {
  changes: boolean;
  digest: boolean;
  digestTime: string;
  reminder: boolean;
  minutes: string;
  timezone: string;
}

const DEFAULTS: SettingsState = {
  changes: true,
  digest: true,
  digestTime: '19:00',
  reminder: false,
  minutes: '30',
  timezone: 'Asia/Omsk',
};

const settingsCacheKey = (groupId: number) => `setka-notification-settings-${groupId}`;

function readCachedSettings(groupId: number): SettingsState | null {
  try {
    const raw = localStorage.getItem(settingsCacheKey(groupId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SettingsState> | null;
    if (!value || typeof value !== 'object') return null;
    const digestTime =
      typeof value.digestTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.digestTime)
        ? value.digestTime
        : DEFAULTS.digestTime;
    return {
      changes: Boolean(value.changes),
      digest: Boolean(value.digest),
      digestTime,
      reminder: Boolean(value.reminder),
      minutes: ['15', '30', '60'].includes(String(value.minutes)) ? String(value.minutes) : DEFAULTS.minutes,
      timezone: typeof value.timezone === 'string' && value.timezone ? value.timezone : DEFAULTS.timezone,
    };
  } catch {
    return null;
  }
}

function writeCachedSettings(groupId: number, value: SettingsState) {
  try {
    localStorage.setItem(settingsCacheKey(groupId), JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));
const PERMISSION_DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function storedToken(groupId: number): string | null {
  try {
    const saved = localStorage.getItem('setka-fcm-token');
    if (saved) return saved;
    // Migration from the pre-redesign key: fcm_token_group_<id>.
    const legacy = localStorage.getItem(`fcm_token_group_${groupId}`);
    if (legacy) {
      localStorage.setItem('setka-fcm-token', legacy);
      return legacy;
    }
  } catch {
    /* private mode */
  }
  return null;
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} />
      <span className="track" />
      <span className="thumb" />
      <span className="sr-only">{label}</span>
    </label>
  );
}

function SettingsBody({ groupId, desktop = false }: { groupId: number; desktop?: boolean }) {
  const subgroup = usePreferences((state) => state.subgroup);
  const setSubgroup = usePreferences((state) => state.setSubgroup);
  const theme = usePreferences((state) => state.theme);
  const setTheme = usePreferences((state) => state.setTheme);
  const [token, setToken] = useState<string | null>(() => storedToken(groupId));
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [status, setStatus] = useState('Изменения сохраняются автоматически');
  const [settings, setSettings] = useState<SettingsState>(() =>
    readCachedSettings(groupId) ?? (token ? DEFAULTS : { ...DEFAULTS, changes: false, digest: false, reminder: false }),
  );
  const settingsRef = useRef(settings);
  const [unsubscribeStep, setUnsubscribeStep] = useState(0);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const permissionRef = useRef<HTMLDialogElement>(null);
  const permissionTimer = useRef<number | undefined>(undefined);
  const week = useWeekSchedule('group', groupId, currentWeekStart());
  const remoteSubgroups = useGroupSubgroups(groupId);
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const health = useHealth();
  const remote = useNotificationSettings(token, 'group', groupId);

  useEffect(() => {
    if (!remote.data) return;
    const next: SettingsState = {
      changes: remote.data.notify_on_change,
      digest: remote.data.notify_daily_digest,
      digestTime: remote.data.digest_time || '19:00',
      reminder: remote.data.notify_before_lesson,
      minutes: String(remote.data.before_minutes || 30),
      timezone: remote.data.timezone || 'Asia/Omsk',
    };
    setSettings(next);
    writeCachedSettings(groupId, next);
  }, [remote.data, groupId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const applyPermission = (value: PermissionState | NotificationPermission) => {
      setPermission(value === 'prompt' ? 'default' : (value as NotificationPermission));
    };
    const refreshPermission = () => applyPermission(Notification.permission);
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);

    let status: PermissionStatus | undefined;
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((result) => {
          status = result;
          applyPermission(result.state);
          result.onchange = () => applyPermission(result.state);
        })
        .catch(() => {
          /* Permission API is optional */
        });
    }

    return () => {
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
      if (status) status.onchange = null;
    };
  }, []);

  useEffect(() => {
    const dialog = permissionRef.current;
    if (!dialog) return;
    if (permissionOpen && !dialog.open) dialog.showModal();
    if (!permissionOpen && dialog.open) dialog.close();
  }, [permissionOpen]);

  useEffect(
    () => () => {
      window.clearTimeout(permissionTimer.current);
    },
    [],
  );

  const subgroups = useMemo(() => {
    const values = new Set<string>(remoteSubgroups.data || []);
    week.data?.forEach((day) => {
      day.lessons.forEach((lesson) => {
        const value = lesson.subgroup_number || normalizeSubgroup(lesson.subgroupName);
        if (value) values.add(value);
      });
    });
    return Array.from(values).sort((left, right) => {
      const a = Number(left);
      const b = Number(right);
      if (Number.isFinite(a) && Number.isFinite(b)) return a - b;
      return left.localeCompare(right);
    });
  }, [remoteSubgroups.data, week.data]);

  const persist = async (next: SettingsState, message = 'Сохранено', subgroupOverride = subgroup) => {
    setStatus('Сохраняем…');
    if (token) {
      try {
        await patchNotificationSettings(token, 'group', groupId, {
          notify_on_change: next.changes,
          notify_daily_digest: next.digest,
          digest_time: next.digestTime,
          notify_before_lesson: next.reminder,
          before_minutes: Number(next.minutes),
          timezone: next.timezone,
          subgroup: subgroupOverride,
        });
        setStatus(message);
      } catch {
        setStatus('Не удалось сохранить. Проверьте сеть.');
      }
    } else {
      setStatus(message);
    }
  };

  const dismissKey = `setka-push-dismissed-${groupId}`;
  const dismissedRecently = () => {
    try {
      const dismissedAt = Number(localStorage.getItem(dismissKey));
      return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < PERMISSION_DISMISS_MS;
    } catch {
      return false;
    }
  };

  const schedulePermissionPrompt = () => {
    if (token || permission === 'unsupported' || dismissedRecently()) return;
    window.clearTimeout(permissionTimer.current);
    permissionTimer.current = window.setTimeout(() => setPermissionOpen(true), 1200);
  };

  const update = (patch: Partial<SettingsState>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    writeCachedSettings(groupId, next);
    setUnsubscribeStep(0);
    if ((patch.changes === true || patch.digest === true || patch.reminder === true) && !token) {
      schedulePermissionPrompt();
    }
    if (!next.changes && !next.digest && !next.reminder) {
      window.clearTimeout(permissionTimer.current);
      setPermissionOpen(false);
    }
    void persist(next);
  };

  const setDigestTime = (part: 'hour' | 'minute', value: string) => {
    const [currentHour = '19', currentMinute = '00'] = settingsRef.current.digestTime.split(':');
    const hour = part === 'hour' ? value : currentHour;
    const minute = part === 'minute' ? value : currentMinute;
    update({ digestTime: `${hour}:${minute}` });
  };

  const enablePush = async (): Promise<boolean> => {
    if (!('Notification' in window)) {
      setStatus('Браузер не поддерживает уведомления.');
      setPermission('unsupported');
      return false;
    }
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== 'granted') {
      setStatus('Разрешение на уведомления не выдано.');
      return false;
    }
    const nextToken = await requestForToken();
    if (!nextToken) {
      setStatus('Не удалось получить токен уведомлений.');
      return false;
    }
    localStorage.setItem('setka-fcm-token', nextToken);
    setToken(nextToken);
    try {
      await subscribe(nextToken, 'group', groupId, subgroup, {
        notify_on_change: settings.changes,
        notify_daily_digest: settings.digest,
        digest_time: settings.digestTime,
        notify_before_lesson: settings.reminder,
        before_minutes: Number(settings.minutes),
        timezone: settings.timezone,
      });
      setStatus('Уведомления разрешены.');
      return true;
    } catch {
      setStatus('Разрешение получено, но подписка не сохранилась. Попробуйте ещё раз.');
      return false;
    }
  };

  const allowPushFromSheet = async () => {
    const allowed = await enablePush();
    if (allowed) {
      try {
        localStorage.removeItem(dismissKey);
      } catch {
        /* private mode */
      }
      setPermissionOpen(false);
    }
  };

  const dismissPermission = () => {
    try {
      localStorage.setItem(dismissKey, String(Date.now()));
    } catch {
      /* private mode */
    }
    setPermissionOpen(false);
  };

  const handleUnsubscribe = async () => {
    if (!token) {
      setStatus('Уведомления не включены для этой группы.');
      return;
    }
    if (unsubscribeStep === 0) {
      setUnsubscribeStep(1);
      return;
    }
    try {
      await unsubscribe(token, 'group', groupId);
    } catch {
      /* keep UI honest; the server may already be empty */
    }
    const next = { ...settingsRef.current, changes: false, digest: false, reminder: false };
    settingsRef.current = next;
    setSettings(next);
    writeCachedSettings(groupId, next);
    setUnsubscribeStep(2);
    setStatus('Вы отписаны от группы.');
  };

  const online = health.data?.upstream.healthy !== false;
  const [digestHour = '19', digestMinute = '00'] = settings.digestTime.split(':');
  const digestMinuteOptions = Array.from(new Set([...MINUTES, digestMinute])).sort();

  return (
    <>
      {!desktop ? (
        <div className="page-head">
          <h1 className="page-title">Настройки</h1>
          <p className="page-sub">Тема, подгруппа и уведомления для {groupName}</p>
        </div>
      ) : null}
      <section className="settings-group" aria-label="Настройки">
        <div className="setting-block">
          <span className="setting-label">Тема</span>
          <p className="setting-desc">Светлая, тёмная или как в системе.</p>
          <div className="segmented" role="group" aria-label="Тема оформления">
            {THEMES.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={theme === item.value}
                onClick={() => setTheme(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <h2 className="settings-heading">Расписание</h2>
        <div className="setting-block">
          <span className="setting-label">Моя подгруппа</span>
          <p className="setting-desc">Влияет на расписание и уведомления. Если не знаете — оставьте «Все».</p>
          <div className="segmented subgroup-segmented" role="group" aria-label="Моя подгруппа">
            <button
              type="button"
              aria-pressed={!subgroup}
              aria-label="Все подгруппы"
              onClick={() => {
                setSubgroup('');
                void persist(settings, 'Сохранено', '');
              }}
            >
              Все
            </button>
            {subgroups.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={subgroup === value}
                aria-label={`${value}-я подгруппа`}
                onClick={() => {
                  setSubgroup(value);
                  void persist(settings, 'Сохранено', value);
                }}
              >
                {value}
              </button>
            ))}
          </div>
          {!subgroups.length ? <p className="setting-desc" style={{ marginTop: 6 }}>В расписании этой группы подгрупп нет.</p> : null}
        </div>

        <h2 className="settings-heading">Уведомления</h2>
        {!token ? (
          <div className="setting-sub">
            {permission === 'denied'
              ? 'Уведомления заблокированы в настройках браузера.'
              : permission === 'unsupported'
                ? 'Браузер не поддерживает уведомления.'
                : permission === 'granted'
                  ? 'Разрешение уже выдано, но уведомления ещё не подключены. '
                  : 'Разрешение на уведомления не выдано. '}
            {permission === 'default' ? (
              <button className="link-btn" type="button" onClick={() => void enablePush()}>
                Разрешить в браузере
              </button>
            ) : null}
            {permission === 'granted' ? (
              <button className="link-btn" type="button" onClick={() => void enablePush()}>
                Подключить уведомления
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="setting-row">
          <div>
            <span className="setting-label">Изменения в расписании</span>
            <p className="setting-desc">Пришлём, когда пара появится, переедет или отменится.</p>
          </div>
          <Toggle checked={settings.changes} onChange={(value) => update({ changes: value })} label="Изменения в расписании" />
        </div>
        <div className="setting-row">
          <div>
            <span className="setting-label">Дайджест на следующий день</span>
            <p className="setting-desc">Одно сообщение вечером со всеми парами на завтра.</p>
          </div>
          <Toggle checked={settings.digest} onChange={(value) => update({ digest: value })} label="Дайджест на следующий день" />
        </div>
        <div className="setting-row">
          <div><span className="setting-label">Время дайджеста</span></div>
          <div className="inline-field time-field">
            <label className="sr-only" htmlFor="digest-hour">Час дайджеста</label>
            <select
              id="digest-hour"
              aria-label="Час дайджеста"
              value={digestHour}
              disabled={!settings.digest}
              onChange={(event) => setDigestTime('hour', event.target.value)}
            >
              {HOURS.map((hour) => <option value={hour} key={hour}>{hour}</option>)}
            </select>
            <span className="time-colon" aria-hidden="true">:</span>
            <label className="sr-only" htmlFor="digest-minute">Минуты дайджеста</label>
            <select
              id="digest-minute"
              aria-label="Минуты дайджеста"
              value={digestMinute}
              disabled={!settings.digest}
              onChange={(event) => setDigestTime('minute', event.target.value)}
            >
              {digestMinuteOptions.map((minute) => <option value={minute} key={minute}>{minute}</option>)}
            </select>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <span className="setting-label">Напоминание перед парой</span>
            <p className="setting-desc">За сколько минут до начала прислать напоминание.</p>
          </div>
          <Toggle checked={settings.reminder} onChange={(value) => update({ reminder: value })} label="Напоминание перед парой" />
        </div>
        <div className="setting-row">
          <div><span className="setting-label">За сколько минут</span></div>
          <div className="inline-field">
            <label className="sr-only" htmlFor="minutes">За сколько минут до пары</label>
            <select id="minutes" value={settings.minutes} disabled={!settings.reminder} onChange={(event) => update({ minutes: event.target.value })}>
              <option value="15">15</option>
              <option value="30">30</option>
              <option value="60">60</option>
            </select>
            <span className="unit">минут</span>
          </div>
        </div>
        <div className="setting-row">
          <div><span className="setting-label">Часовой пояс</span></div>
          <div className="inline-field">
            <label className="sr-only" htmlFor="timezone">Часовой пояс</label>
            <select id="timezone" value={settings.timezone} onChange={(event) => update({ timezone: event.target.value })}>
              <option value="Asia/Omsk">Омск, UTC+6</option>
              <option value="Asia/Novosibirsk">Новосибирск, UTC+7</option>
              <option value="Europe/Moscow">Москва, UTC+3</option>
            </select>
          </div>
        </div>
      </section>

      <p className="setting-sub">
        Уведомления приходят в этот браузер. Разрешение можно отозвать в настройках сайта. Всего можно подписаться на 10 групп, преподавателей и аудиторий.
      </p>
      <div className="save-row">
        <p className="autosave" role="status">{status}</p>
        <button className="btn-quiet" type="button" onClick={() => void handleUnsubscribe()} disabled={unsubscribeStep === 2}>
          {unsubscribeStep === 0 ? 'Отписаться от группы' : unsubscribeStep === 1 ? 'Нажмите ещё раз, чтобы отписаться' : 'Вы отписаны от группы'}
        </button>
      </div>
      <div className="status-line">
        <i className={`dot${online ? '' : ' is-stale'}`} />
        {online ? 'Сервер отвечает, кэш обновлён недавно' : 'Сервер недоступен, показаны сохранённые данные'}
      </div>
      <dialog
        ref={permissionRef}
        className="sheet permission-sheet"
        aria-labelledby="permission-title"
        onClose={() => setPermissionOpen(false)}
        onClick={(event) => {
          if (event.target === permissionRef.current) dismissPermission();
        }}
      >
        <header className="sheet-head">
          <div className="sheet-head-text">
            <h2 className="sheet-title" id="permission-title">Уведомления для {groupName}</h2>
            <p className="sheet-sub">Изменения пар, дайджест и напоминания</p>
          </div>
          <button className="sheet-close" type="button" aria-label="Закрыть" onClick={dismissPermission}>
            <X size={22} strokeWidth={1.6} />
          </button>
        </header>
        <div className="sheet-scroll">
          <div className="permission-body">
            {permission === 'denied' ? (
              <p>Браузер заблокировал уведомления для этого сайта. Разрешите их в настройках сайта в браузере, затем вернитесь сюда.</p>
            ) : permission === 'unsupported' ? (
              <p>Этот браузер не поддерживает push-уведомления. Можно пользоваться расписанием без них.</p>
            ) : (
              <p>
                Разрешите уведомления в браузере — и мы пришлём изменения расписания и дайджест на завтра для группы {groupName}.
              </p>
            )}
            <div className="permission-actions">
              {permission !== 'denied' && permission !== 'unsupported' ? (
                <button className="btn-primary" type="button" onClick={() => void allowPushFromSheet()}>
                  {permission === 'granted' ? 'Подключить' : 'Разрешить'}
                </button>
              ) : null}
              <button className="btn-quiet" type="button" onClick={dismissPermission}>
                Позже
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <p className="footnote">
        Вернуться к расписанию: <AppLink to={`/g/${groupId}/today`}>сегодня</AppLink> · <AppLink to={`/g/${groupId}/week`}>неделя</AppLink>
      </p>
    </>
  );
}

export function SettingsPage({ groupId }: { groupId: number }) {
  const isDesktop = useIsDesktop();
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);

  usePageMeta(`Настройки — ${groupName} — сетка`, `Тема, подгруппа и уведомления для группы ${groupName}.`);

  if (isDesktop) {
    return (
      <>
        <header className="desk-top">
          <div className="desk-title"><h1 className="desk-group">Настройки</h1><div className="desk-sub">{groupName}</div></div>
        </header>
        <div className="desk-body is-single">
          <div className="desk-page">
            <SettingsBody key={groupId} groupId={groupId} desktop />
          </div>
        </div>
      </>
    );
  }

  return <SettingsBody key={groupId} groupId={groupId} />;
}
