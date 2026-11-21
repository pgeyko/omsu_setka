import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuditoryMapPage } from './AuditoryMapPage';

vi.mock('../lib/usePageMeta', () => ({ usePageMeta: () => {} }));
vi.mock('../api/queries', () => ({
  useBuildings: () => ({
    data: { buildings: [{ building: '4', rooms: 3 }] },
    isLoading: false,
  }),
  useAuditoryMap: () => ({
    data: {
      building: '4',
      date: '2026-11-21',
      ready: true,
      stale: false,
      updated_at: '2026-11-21T07:30:00+06:00',
      rooms: [
        { id: 1, name: '4-112', floor: 1, busy: [], free: true },
        { id: 2, name: '4-313', floor: 3, busy: [1], free: false },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

describe('AuditoryMapPage', () => {
  it('shows free and busy rooms with building navigation', () => {
    render(
      <MemoryRouter initialEntries={['/map?building=4&pair=1']}>
        <AuditoryMapPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Аудитории' })).toBeInTheDocument();
    expect(screen.getByText('4-112')).toBeInTheDocument();
    expect(screen.getByText('4-313')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /4-112, свободна/ })).toHaveAttribute('href', '/auditory/1');
    expect(screen.getByRole('link', { name: /4-313, занята/ })).toHaveAttribute('href', '/auditory/2');
  });
});
