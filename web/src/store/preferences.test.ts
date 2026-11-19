import { beforeEach, describe, expect, it } from 'vitest';
import { usePreferences } from './preferences';
import { resetPreferences } from '../test/utils';

const group = (id: number, name = `Группа ${id}`) => ({ id, name });

describe('preferences store', () => {
  beforeEach(() => {
    resetPreferences();
    usePreferences.setState({ theme: 'system', subgroup: '', group: null });
  });

  it('stores the selected group and mirrors it to localStorage', () => {
    usePreferences.getState().setGroup(group(472, 'ЮСС-003-О-02'));
    expect(usePreferences.getState().group).toEqual({ id: 472, name: 'ЮСС-003-О-02' });
    expect(localStorage.getItem('setka-group')).toBe('472');
    expect(localStorage.getItem('setka-group-name')).toBe('ЮСС-003-О-02');
  });

  it('clears the group', () => {
    usePreferences.getState().setGroup(group(1));
    usePreferences.getState().setGroup(null);
    expect(usePreferences.getState().group).toBeNull();
    expect(localStorage.getItem('setka-group')).toBeNull();
  });

  it('persists subgroup and theme', () => {
    usePreferences.getState().setSubgroup('2');
    usePreferences.getState().setTheme('dark');
    expect(usePreferences.getState().subgroup).toBe('2');
    expect(usePreferences.getState().theme).toBe('dark');
    expect(localStorage.getItem('setka-subgroup')).toBe('2');
    expect(localStorage.getItem('setka-theme')).toBe('dark');
  });

  it('deduplicates favourites and keeps at most six', () => {
    const { addFavorite } = usePreferences.getState();
    addFavorite(group(1));
    addFavorite(group(1));
    [2, 3, 4, 5, 6, 7, 8].forEach((id) => addFavorite(group(id)));
    const ids = usePreferences.getState().favorites.map((item) => item.id);
    expect(ids).toEqual([3, 4, 5, 6, 7, 8]);
  });

  it('toggles a favourite off', () => {
    const { addFavorite, toggleFavorite } = usePreferences.getState();
    addFavorite(group(1));
    toggleFavorite(group(1));
    expect(usePreferences.getState().favorites).toEqual([]);
  });

  it('keeps recent groups unique and limited to five', () => {
    const { addRecent } = usePreferences.getState();
    [1, 2, 3, 4, 5, 6].forEach((id) => addRecent(group(id)));
    addRecent(group(3));
    expect(usePreferences.getState().recent.map((item) => item.id)).toEqual([3, 6, 5, 4, 2]);
  });

  it('deduplicates recent entities by type and id', () => {
    const { addRecentEntity } = usePreferences.getState();
    addRecentEntity({ type: 'tutor', id: 15, name: 'Иванов' });
    addRecentEntity({ type: 'auditory', id: 15, name: '4-308' });
    addRecentEntity({ type: 'tutor', id: 15, name: 'Иванов И. И.' });
    expect(usePreferences.getState().recentEntities).toEqual([
      { type: 'tutor', id: 15, name: 'Иванов И. И.' },
      { type: 'auditory', id: 15, name: '4-308' },
    ]);
  });

  it('limits recent entities to five', () => {
    const { addRecentEntity } = usePreferences.getState();
    [1, 2, 3, 4, 5, 6].forEach((id) =>
      addRecentEntity({ type: 'auditory', id, name: `${id}` }),
    );
    expect(usePreferences.getState().recentEntities).toHaveLength(5);
    expect(usePreferences.getState().recentEntities[0].id).toBe(6);
  });
});
