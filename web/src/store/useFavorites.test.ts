import { describe, it, expect, beforeEach } from 'vitest';
import { useFavoritesStore } from './useFavorites';

describe('useFavoritesStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useFavoritesStore.setState({
      favorites: [],
      recent: [],
      recentTutors: [],
      recentAuditories: [],
      subgroup: null,
      pinnedEntity: null
    });
  });

  it('adds and removes favorites', () => {
    const item = { id: 1, name: 'Группа 1', type: 'group' as const };
    
    useFavoritesStore.getState().addFavorite(item);
    expect(useFavoritesStore.getState().favorites).toHaveLength(1);
    expect(useFavoritesStore.getState().isFavorite(1, 'group')).toBe(true);

    useFavoritesStore.getState().removeFavorite(1, 'group');
    expect(useFavoritesStore.getState().favorites).toHaveLength(0);
    expect(useFavoritesStore.getState().isFavorite(1, 'group')).toBe(false);
  });

  it('manages 5 recent items limit', () => {
    const store = useFavoritesStore.getState();
    
    // Add 6 different items
    for (let i = 1; i <= 6; i++) {
      store.addRecent({ id: i, name: `Item ${i}`, type: 'group' as const });
    }

    const state = useFavoritesStore.getState();
    expect(state.recent).toHaveLength(5);
    // Should contain the last 5 added (2 to 6) in reverse order of addition (6 first)
    expect(state.recent[0].id).toBe(6);
    expect(state.recent[4].id).toBe(2);
  });

  it('updates existing recent item to top', () => {
    const store = useFavoritesStore.getState();
    
    store.addRecent({ id: 1, name: 'Item 1', type: 'group' as const });
    store.addRecent({ id: 2, name: 'Item 2', type: 'group' as const });
    
    expect(useFavoritesStore.getState().recent[0].id).toBe(2);

    // Re-add Item 1
    store.addRecent({ id: 1, name: 'Item 1', type: 'group' as const });
    
    const state = useFavoritesStore.getState();
    expect(state.recent).toHaveLength(2);
    expect(state.recent[0].id).toBe(1); // Item 1 should be at top now
  });

  it('keeps recent groups, tutors, and auditories in separate lists', () => {
    const store = useFavoritesStore.getState();

    store.addRecent({ id: 1, name: 'Группа 1', type: 'group' });
    store.addRecent({ id: 2, name: 'Преподаватель 1', type: 'tutor' });
    store.addRecent({ id: 3, name: 'Аудитория 1', type: 'auditory' });

    const state = useFavoritesStore.getState();
    expect(state.recent.map(item => item.id)).toEqual([1]);
    expect(state.recentTutors.map(item => item.id)).toEqual([2]);
    expect(state.recentAuditories.map(item => item.id)).toEqual([3]);
  });

  it('pins and unpins an entity for the home page', () => {
    const item = { id: 1, name: 'Группа 1', type: 'group' as const };

    useFavoritesStore.getState().pinEntity(item);
    expect(useFavoritesStore.getState().pinnedEntity).toEqual(item);

    useFavoritesStore.getState().unpinEntity();
    expect(useFavoritesStore.getState().pinnedEntity).toBeNull();
  });
});
