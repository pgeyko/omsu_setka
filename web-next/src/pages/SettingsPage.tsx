import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGroupName, useHealth, useNotificationSettings, useWeekSchedule } from '../api/queries';
import { patchNotificationSettings, subscribe, unsubscribe } from '../api/client';
import { usePreferences } from '../store/preferences';
import { useIsDesktop } from '../lib/useMediaQuery';
import { requestForToken } from '../lib/firebase';
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
  const [status, setStatus] = useState('Изменения сохраняются автоматически');
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);
  const [digestDraft, setDigestDraft] = useState(DEFAULTS.digestTime);
  const [unsubscribeStep, setUnsubscribeStep] = useState(0);
  const week = useWeekSchedule('group', groupId, currentWeekStart());
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const health = useHealth();
  const remote = useNotificationSettings(token, 'group', groupId);

  useEffect(() => {
    if (!remote.data) return;
    setSettings({
      changes: remote.data.notify_on_change,
      digest: remote.data.notify_daily_digest,
      digestTime: remote.data.digest_time || '19:00',
      reminder: remote.data.notify_before_lesson,
      minutes: String(remote.data.before_minutes || 30),
      timezone: remote.data.timezone || 'Asia/Omsk',
    });
  }, [remote.data]);

  useEffect(() => {
    setDigestDraft(settings.digestTime);
  }, [settings.digestTime]);

  const subgroups = useMemo(() => {
    const values = new Set<string>();
    week.data?.forEach((day) => {
      day.lessons.forEach((lesson) => {
        const value = lesson.subgroup_number || normalizeSubgroup(lesson.subgroupName);
        if (value) values.add(value);
      });
    });
    return Array.from(values).sort();
  }, [week.data]);

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

  const update = (patch: Partial<SettingsState>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setUnsubscribeStep(0);
    void persist(next);
  };

  const commitDigestTime = () => {
    const value = digestDraft.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      setDigestDraft(settings.digestTime);
      setStatus('Время дайджеста — в формате ЧЧ:ММ');
      return;
    }
    if (value !== settings.digestTime) update({ digestTime: value });
  };

  const enablePush = async () => {
    if (!('Notification' in window)) {
      setStatus('Браузер не поддерживает уведомления.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('Разрешение на уведомления не выдано.');
      return;
    }
    const nextToken = await requestForToken();
    if (!nextToken) {
      setStatus('Не удалось получить токен уведомлений.');
      return;
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
    } catch {
      setStatus('Разрешение получено, но подписка не сохранилась. Попробуйте ещё раз.');
    }
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
    setUnsubscribeStep(2);
    setStatus('Вы отписаны от группы.');
  };

  const online = health.data?.upstream.healthy !== false;

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
        <div className="setting-row">
          <div>
            <span className="setting-label">Моя подгруппа</span>
            <p className="setting-desc">Влияет на расписание и уведомления. Если не знаете — оставьте «Все».</p>
          </div>
          <div className="inline-field">
            <label className="sr-only" htmlFor="subgroup">Моя подгруппа</label>
            <select
              id="subgroup"
              value={subgroup}
              onChange={(event) => {
                const value = event.target.value;
                setSubgroup(value);
                void persist(settings, 'Сохранено', value);
              }}
            >
              <option value="">Все</option>
              {subgroups.map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </div>
        </div>

        <h2 className="settings-heading">Уведомления</h2>
        {!token ? (
          <div className="setting-sub">
            Разрешение на уведомления не выдано.{' '}
            <button className="link-btn" type="button" onClick={() => void enablePush()}>
              Разрешить в браузере
            </button>
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
          <div className="inline-field">
            <label className="sr-only" htmlFor="digest-time">Время дайджеста</label>
            <input
              id="digest-time"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-2][0-9]:[0-5][0-9]"
              maxLength={5}
              value={digestDraft}
              disabled={!settings.digest}
              onChange={(event) => {
                const value = event.target.value;
                if (/^[0-9:]*$/.test(value)) setDigestDraft(value);
              }}
              onBlur={commitDigestTime}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
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
      <p className="footnote">
        Вернуться к расписанию: <Link to={`/g/${groupId}/today`}>сегодня</Link> · <Link to={`/g/${groupId}/week`}>неделя</Link>
      </p>
    </>
  );
}

export function SettingsPage({ groupId }: { groupId: number }) {
  const isDesktop = useIsDesktop();
  const savedGroup = usePreferences((state) => state.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);

  if (isDesktop) {
    return (
      <>
        <header className="desk-top">
          <div className="desk-title"><h1 className="desk-group">Настройки</h1><div className="desk-sub">{groupName}</div></div>
        </header>
        <div className="desk-body is-single">
          <div className="desk-page">
            <SettingsBody groupId={groupId} desktop />
          </div>
        </div>
      </>
    );
  }

  return <SettingsBody groupId={groupId} />;
}
