import { useEffect } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePreferences } from './store/preferences';
import { useIsDesktop } from './lib/useMediaQuery';
import { DesktopShell, MobileShell } from './components/AppShell';
import { TodayPage } from './pages/TodayPage';
import { WeekPage } from './pages/WeekPage';
import { SearchPage } from './pages/SearchPage';
import { ChangesPage } from './pages/ChangesPage';
import { SettingsPage } from './pages/SettingsPage';
import { EntityPage } from './pages/EntityPage';
import { NotFoundPage } from './pages/NotFoundPage';
import './styles/app.css';

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeSync() {
  const theme = usePreferences((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#131814' : '#F7F8F3');
    };
    apply();
    if (theme === 'system') {
      media.addEventListener('change', apply);
      return () => media.removeEventListener('change', apply);
    }
    return undefined;
  }, [theme]);

  return null;
}

function HomeRedirect() {
  const group = usePreferences((state) => state.group);
  return <Navigate to={group ? `/g/${group.id}/today` : '/search'} replace />;
}

function useGroupId(): number {
  const params = useParams();
  return Number(params.groupId) || 0;
}

function GroupShell({ children }: { children: React.ReactNode }) {
  const groupId = useGroupId();
  const subgroup = usePreferences((state) => state.subgroup);
  const isDesktop = useIsDesktop();

  if (!groupId) return <Navigate to="/search" replace />;
  return isDesktop ? (
    <DesktopShell groupId={groupId} subgroup={subgroup}>
      {children}
    </DesktopShell>
  ) : (
    <MobileShell groupId={groupId} subgroup={subgroup}>
      {children}
    </MobileShell>
  );
}

function TodayRoute() {
  const groupId = useGroupId();
  const isDesktop = useIsDesktop();
  if (isDesktop) return <Navigate to={`/g/${groupId}/week`} replace />;
  return (
    <GroupShell>
      <TodayPage groupId={groupId} />
    </GroupShell>
  );
}

function WeekRoute() {
  const groupId = useGroupId();
  return (
    <GroupShell>
      <WeekPage groupId={groupId} />
    </GroupShell>
  );
}

function ChangesRoute() {
  const groupId = useGroupId();
  return (
    <GroupShell>
      <ChangesPage groupId={groupId} />
    </GroupShell>
  );
}

function SettingsRoute() {
  const groupId = useGroupId();
  return (
    <GroupShell>
      <SettingsPage groupId={groupId} />
    </GroupShell>
  );
}

function EntityRoute({ type }: { type: 'tutor' | 'auditory' }) {
  const params = useParams();
  const id = Number(params.id) || 0;
  const groupId = usePreferences((state) => state.group?.id) || 0;
  const subgroup = usePreferences((state) => state.subgroup);
  const isDesktop = useIsDesktop();
  if (!id) return <Navigate to="/search" replace />;
  if (!groupId) return <Navigate to="/search" replace />;
  return isDesktop ? (
    <DesktopShell groupId={groupId} subgroup={subgroup}>
      <EntityPage type={type} id={id} />
    </DesktopShell>
  ) : (
    <MobileShell groupId={groupId} subgroup={subgroup}>
      <EntityPage type={type} id={id} />
    </MobileShell>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={client}>
      <ThemeSync />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/g/:groupId/today" element={<TodayRoute />} />
        <Route path="/g/:groupId/week" element={<WeekRoute />} />
        <Route path="/g/:groupId/changes" element={<ChangesRoute />} />
        <Route path="/g/:groupId/settings" element={<SettingsRoute />} />
        <Route path="/tutor/:id" element={<EntityRoute type="tutor" />} />
        <Route path="/auditory/:id" element={<EntityRoute type="auditory" />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </QueryClientProvider>
  );
}
