import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePreferences } from '../store/preferences';

export function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function setViewport(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width });
}

export function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>;
}

export function resetPreferences() {
  usePreferences.setState({
    group: null,
    subgroup: '',
    theme: 'system',
    favorites: [],
    recent: [],
    recentEntities: [],
  });
  localStorage.clear();
}

interface RenderRouteOptions {
  route?: string;
  width?: number;
  client?: QueryClient;
  withProbe?: boolean;
}

export function renderRoute(ui: ReactNode, options: RenderRouteOptions = {}) {
  const { route = '/', width = 390, client = createTestClient(), withProbe = true } = options;
  setViewport(width);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        {ui}
        {withProbe ? <LocationProbe /> : null}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
