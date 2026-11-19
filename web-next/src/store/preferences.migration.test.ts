import { beforeEach, describe, expect, it, vi } from 'vitest';

function seedLegacy() {
  localStorage.setItem(
    'omsu-setka-favorites',
    JSON.stringify({
      state: {
        pinnedEntity: { id: 472, type: 'group', name: 'ЮСС-003-О-02', real_group_id: 12246 },
        favorites: [
          { id: 472, type: 'group', name: 'ЮСС-003-О-02', real_group_id: 12246 },
          { id: 468, type: 'group', name: 'ЮСС-002-О-01' },
          { id: 15, type: 'tutor', name: 'Иванов Иван Иванович' },
        ],
        recent: [{ id: 472, type: 'group', name: 'ЮСС-003-О-02' }],
        recentTutors: [{ id: 15, type: 'tutor', name: 'Иванов Иван Иванович' }],
        recentAuditories: [{ id: 3310, type: 'auditory', name: '4-308' }],
        subgroup: '2',
      },
      version: 0,
    }),
  );
  localStorage.setItem('omsu-setka-settings', JSON.stringify({ state: { theme: 'dark' }, version: 0 }));
}

describe('preferences migration from the old app', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it('imports the pinned group, favourites, recents, subgroup and theme', async () => {
    seedLegacy();
    const { usePreferences } = await import('./preferences');
    const state = usePreferences.getState();
    expect(state.group).toEqual({ id: 472, name: 'ЮСС-003-О-02' });
    expect(state.subgroup).toBe('2');
    expect(state.theme).toBe('dark');
    expect(state.favorites.map((item) => item.id)).toEqual([472, 468]);
    expect(state.recent.map((item) => item.id)).toEqual([472]);
    expect(state.recentEntities).toEqual([
      { type: 'tutor', id: 15, name: 'Иванов Иван Иванович' },
      { type: 'auditory', id: 3310, name: '4-308' },
      { type: 'group', id: 472, name: 'ЮСС-003-О-02' },
    ]);
  });

  it('uses the dictionary id of a legacy group', async () => {
    localStorage.setItem(
      'omsu-setka-favorites',
      JSON.stringify({ state: { pinnedEntity: { id: 468, type: 'group', name: 'ЮСС-002-О-01' } } }),
    );
    const { usePreferences } = await import('./preferences');
    expect(usePreferences.getState().group).toEqual({ id: 468, name: 'ЮСС-002-О-01' });
  });

  it('prefers the new keys over the legacy data', async () => {
    seedLegacy();
    localStorage.setItem('setka-group', '777');
    localStorage.setItem('setka-group-name', 'Новая группа');
    localStorage.setItem('setka-subgroup', '1');
    localStorage.setItem('setka-theme', 'light');
    const { usePreferences } = await import('./preferences');
    const state = usePreferences.getState();
    expect(state.group).toEqual({ id: 777, name: 'Новая группа' });
    expect(state.subgroup).toBe('1');
    expect(state.theme).toBe('light');
    expect(state.favorites[0]).toEqual({ id: 777, name: 'Новая группа' });
  });

  it('ignores malformed legacy JSON', async () => {
    localStorage.setItem('omsu-setka-favorites', '{not json');
    localStorage.setItem('omsu-setka-settings', '["broken"]');
    const { usePreferences } = await import('./preferences');
    const state = usePreferences.getState();
    expect(state.group).toBeNull();
    expect(state.theme).toBe('system');
    expect(state.favorites).toEqual([]);
  });
});
