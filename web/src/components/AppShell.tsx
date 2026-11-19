import { useLocation } from 'react-router-dom';
import { AppLink } from './AppLink';
import { CalendarDays, ChevronDown, LayoutGrid, ArrowLeftRight, SlidersHorizontal, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePreferences } from '../store/preferences';
import { useGroupName, useWeekSchedule } from '../api/queries';
import { currentWeekStart } from '../lib/date';
import { useOnline } from '../lib/useOnline';

function Brand() {
  return (
    <span className="brand">
      сетка
      <span className="brand-dot" />
    </span>
  );
}

function OfflineBar() {
  return (
    <div className="offline-bar" role="status">
      <i className="dot is-stale" /> Нет сети · данные от 2 минут назад
    </div>
  );
}

function BottomNav({ groupId }: { groupId: number }) {
  const { pathname } = useLocation();
  const items = [
    { to: `/g/${groupId}/today`, label: 'Сегодня', icon: CalendarDays, active: pathname.endsWith('/today') },
    { to: `/g/${groupId}/week`, label: 'Неделя', icon: LayoutGrid, active: pathname.endsWith('/week') || pathname.includes('/tutor') || pathname.includes('/auditory') },
    { to: `/g/${groupId}/changes`, label: 'Изменения', icon: ArrowLeftRight, active: pathname.endsWith('/changes') },
    { to: `/g/${groupId}/settings`, label: 'Настройки', icon: SlidersHorizontal, active: pathname.endsWith('/settings') },
  ];
  return (
    <nav className="bottom-nav" aria-label="Основное меню">
      {items.map(({ to, label, icon: Icon, active }) => (
        <AppLink key={to} to={to} className="bn-item" aria-current={active ? 'page' : undefined}>
          <Icon size={21} strokeWidth={1.6} aria-hidden />
          <span>{label}</span>
        </AppLink>
      ))}
    </nav>
  );
}

function useFreshness(groupId: number) {
  const week = useWeekSchedule('group', groupId, currentWeekStart());
  if (week.isFetching) return 'обновляется…';
  if (!week.dataUpdatedAt) return 'онлайн';
  const minutes = Math.max(0, Math.round((Date.now() - week.dataUpdatedAt) / 60000));
  if (minutes < 1) return 'только что';
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.round(minutes / 60)} ч назад`;
}

export function MobileShell({
  groupId,
  subgroup,
  children,
}: {
  groupId: number;
  subgroup: string;
  children: ReactNode;
}) {
  const savedGroup = usePreferences((s) => s.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const freshness = useFreshness(groupId);
  const online = useOnline();

  return (
    <div className="mobile-app">
      <a className="skip skip-mobile" href="#content">Перейти к расписанию</a>
      <header className="m-top">
        <div className="m-top-row">
          <AppLink className="brand" to={`/g/${groupId}/today`} aria-label="сетка — на главную">
            <Brand />
          </AppLink>
          <AppLink
            className="icon-btn"
            to="/search"
            aria-label="Найти группу, преподавателя или аудиторию"
            animate={false}
          >
            <Search size={22} strokeWidth={1.6} />
          </AppLink>
        </div>
        <div className="m-group-row">
          <div>
            <span className="m-group-label">
              группа{' '}
              <AppLink className="subgroup-link" to={`/g/${groupId}/settings`}>
                {subgroup ? `· подгруппа ${subgroup}` : ''}
              </AppLink>
            </span>
            <AppLink className="m-group-name" to="/search" animate={false}>
              {groupName}
              <ChevronDown size={16} strokeWidth={1.6} />
            </AppLink>
          </div>
          <span className="freshness">
            <i className={`dot${online ? '' : ' is-stale'}`} />
            {online ? freshness : 'офлайн'}
          </span>
        </div>
      </header>
      {!online && <OfflineBar />}
      <main id="content">{children}</main>
      <BottomNav groupId={groupId} />
    </div>
  );
}

export function PlainMobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="mobile-app">
      <a className="skip skip-mobile" href="#content">
        Перейти к расписанию
      </a>
      <header className="m-top">
        <div className="m-top-row">
          <AppLink className="brand" to="/search" aria-label="сетка — поиск">
            <Brand />
          </AppLink>
          <AppLink
            className="icon-btn"
            to="/search"
            aria-label="Найти группу, преподавателя или аудиторию"
            animate={false}
          >
            <Search size={22} strokeWidth={1.6} />
          </AppLink>
        </div>
      </header>
      <main id="content">{children}</main>
    </div>
  );
}

export function PlainDesktopShell({ children }: { children: ReactNode }) {
  return (
    <div className="desktop-app">
      <a className="skip skip-desktop" href="#d-content">
        Перейти к расписанию
      </a>
      <aside className="side" aria-label="Навигация">
        <AppLink className="brand" to="/search" aria-label="сетка — поиск">
          <Brand />
        </AppLink>
        <AppLink className="side-search" to="/search" aria-label="Открыть поиск" animate={false}>
          <Search size={16} strokeWidth={1.6} />
          <span>Найти группу или преподавателя</span>
        </AppLink>
        <div className="side-foot">Расписание ОмГУ, зеркало на этом сервере.</div>
      </aside>
      <div className="desk-main" id="d-content">{children}</div>
    </div>
  );
}

export function DesktopShell({
  groupId,
  subgroup,
  children,
}: {
  groupId: number;
  subgroup: string;
  children: ReactNode;
}) {
  const savedGroup = usePreferences((s) => s.group);
  const groupName = useGroupName(groupId, savedGroup?.id === groupId ? savedGroup.name : undefined);
  const { favorites, recent, setGroup, addRecent } = usePreferences();
  const location = useLocation();
  const freshness = useFreshness(groupId);
  const online = useOnline();
  const seen = new Set<number>();
  const groups = [{ id: groupId, name: groupName }, ...favorites, ...recent]
    .filter((item) => {
      if (!item.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, 4);

  return (
    <div className="desktop-app">
      <a className="skip skip-desktop" href="#d-content">Перейти к расписанию</a>
      <aside className="side" aria-label="Навигация">
        <AppLink className="brand" to={`/g/${groupId}/week`} aria-label="сетка — на главную">
          <Brand />
        </AppLink>
        <AppLink className="side-search" to="/search" aria-label="Открыть поиск" animate={false}>
          <Search size={16} strokeWidth={1.6} />
          <span>Найти группу или преподавателя</span>
        </AppLink>
        <nav className="side-nav" aria-label="Разделы">
          <AppLink
            to={`/g/${groupId}/week`}
            aria-current={
              location.pathname.endsWith('/week') ||
              location.pathname.includes('/tutor') ||
              location.pathname.includes('/auditory')
                ? 'page'
                : undefined
            }
          >
            <LayoutGrid size={17} strokeWidth={1.6} /> Неделя
          </AppLink>
          <AppLink to={`/g/${groupId}/changes`} aria-current={location.pathname.endsWith('/changes') ? 'page' : undefined}>
            <ArrowLeftRight size={17} strokeWidth={1.6} /> Изменения
          </AppLink>
          <AppLink to={`/g/${groupId}/settings`} aria-current={location.pathname.endsWith('/settings') ? 'page' : undefined}>
            <SlidersHorizontal size={17} strokeWidth={1.6} /> Настройки
          </AppLink>
        </nav>
        <div>
          <p className="side-label">Мои группы</p>
          <div className="side-groups">
            {groups.map((item) => (
              <AppLink
                key={item.id}
                className="side-group"
                to={`/g/${item.id}/week`}
                aria-current={item.id === groupId ? 'true' : undefined}
                onClick={() => {
                  if (item.name) {
                    setGroup({ id: item.id, name: item.name });
                    addRecent({ id: item.id, name: item.name });
                  }
                }}
              >
                <span>{item.name || `Группа ${item.id}`}</span>
                <i className="pin" />
              </AppLink>
            ))}
          </div>
        </div>
        <div className="side-foot">
          {subgroup ? `подгруппа ${subgroup} · ` : ''}
          Расписание ОмГУ, зеркало на этом сервере.
          <br />
          <span className="freshness">
            <i className={`dot${online ? '' : ' is-stale'}`} />
            {online ? freshness : 'офлайн'}
          </span>
        </div>
      </aside>
      <div className="desk-main" id="d-content">
        {!online && <OfflineBar />}
        {children}
      </div>
    </div>
  );
}
